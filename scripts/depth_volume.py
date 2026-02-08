"""Depth-map-based volume estimation pipeline for dump truck cargo."""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from scipy.ndimage import median_filter
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

CLI_AI_ANALYZER = r"C:\Users\yuuji\cli-ai-analyzer\target\release\cli-ai-analyzer.exe"
PROMPT_SPEC_PATH = Path(r"C:\Users\yuuji\TonSuuChecker\prompt-spec.json")
MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"
PLATE_WIDTH_M = 0.44  # 大型車ナンバープレート実幅 (m)
TAILGATE_HEIGHT_M = 0.30  # 後板(テールゲート上縁)高さ (m)

# Material densities (t/m3)
MATERIAL_DENSITIES = {
    "土砂": 1.8,
    "As殻": 2.5,
    "Co殻": 2.5,
    "開粒度As殻": 2.35,
}


def load_truck_specs():
    """Load truck specifications from prompt-spec.json."""
    with open(PROMPT_SPEC_PATH, encoding="utf-8") as f:
        spec = json.load(f)
    return spec["truckSpecs"]


def generate_depth_map(image_path: str) -> tuple[np.ndarray, Image.Image]:
    """Generate depth map using Depth Anything V2 Small."""
    print("Loading depth model...", file=sys.stderr)
    processor = AutoImageProcessor.from_pretrained(MODEL_ID)
    model = AutoModelForDepthEstimation.from_pretrained(MODEL_ID)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}", file=sys.stderr)
    model = model.to(device)

    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt").to(device)

    with torch.no_grad():
        outputs = model(**inputs)

    predicted_depth = outputs.predicted_depth
    prediction = torch.nn.functional.interpolate(
        predicted_depth.unsqueeze(1),
        size=image.size[::-1],  # (H, W)
        mode="bicubic",
        align_corners=False,
    ).squeeze().cpu().numpy()

    print(
        f"Depth map: shape={prediction.shape}, "
        f"min={prediction.min():.4f}, max={prediction.max():.4f}, "
        f"mean={prediction.mean():.4f}",
        file=sys.stderr,
    )
    return prediction, image


def query_gemini_regions(image_path: str) -> dict:
    """Use cli-ai-analyzer to get truck bed bbox + license plate bbox via Gemini.

    Returns dict with keys: bedBox, plateBox (each [x1,y1,x2,y2] normalized 0-1).
    Missing keys are absent.
    """
    prompt = (
        'Output ONLY JSON: {"bedBox": [x1,y1,x2,y2], "plateBox": [x1,y1,x2,y2]} '
        "bedBox = bounding box of the truck bed opening (cargo area). "
        "plateBox = bounding box of the rear license plate of the truck. "
        "All coordinates are normalized 0.0-1.0 relative to image width/height. "
        "x1,y1 = top-left, x2,y2 = bottom-right."
    )
    cmd = [
        CLI_AI_ANALYZER,
        "analyze",
        "--json",
        "--model", "gemini-3-flash-preview",
        "--prompt", prompt,
        image_path,
    ]
    print("Querying Gemini for bedBox + plateBox...", file=sys.stderr)
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=120
        )
        if result.returncode != 0:
            print(f"CLI error: {result.stderr}", file=sys.stderr)
            return {}

        raw = result.stdout.strip()
        raw = re.sub(r"```(?:json)?\s*", "", raw).strip()

        # Find JSON object
        brace_start = raw.find("{")
        brace_end = raw.rfind("}") + 1
        if brace_start >= 0 and brace_end > brace_start:
            data = json.loads(raw[brace_start:brace_end])
        else:
            data = json.loads(raw)

        out = {}
        for key in ("bedBox", "plateBox"):
            bbox = data.get(key)
            if bbox and len(bbox) == 4:
                bbox = [float(v) for v in bbox]
                if all(0.0 <= v <= 1.0 for v in bbox) and bbox[0] < bbox[2] and bbox[1] < bbox[3]:
                    out[key] = bbox
                    print(f"{key} (normalized): {bbox}", file=sys.stderr)
                else:
                    print(f"Invalid {key}: {bbox}", file=sys.stderr)
        return out
    except (subprocess.TimeoutExpired, json.JSONDecodeError, ValueError) as e:
        print(f"Gemini query failed: {e}", file=sys.stderr)
        return {}


def compute_depth_scale(
    depth_map: np.ndarray,
    plate_bbox_px: tuple[int, int, int, int],
    bed_bbox_px: tuple[int, int, int, int],
    img_w: int,
) -> float | None:
    """Compute depth-to-meters scale using bed edge depth vs plate depth.

    Strategy: The bed bbox top edge = 後板上端 ≈ 荷台床面レベル (floor level).
    The plate is on the outside of the 後板 (tailgate), at the same depth as the
    tailgate exterior surface. The vertical distance from bed top edge to plate
    center in pixels, combined with m_per_pixel from plate width, gives a known
    real-world distance. Comparing this with depth values lets us establish
    meters_per_depth_unit.

    Specifically:
    - bed top edge depth (後板上端) = floor level (depth: farther = smaller value)
    - plate center depth (後板外面) = closer to camera (depth: larger value)
    - The depth difference between plate and bed-edge at the same horizontal
      position corresponds to the real depth offset of the tailgate surface
      vs the cargo floor. For an empty bed this ≈ bed wall thickness (~0.05m),
      but what matters is establishing any known reference pair.

    Alternative approach: use floor_depth from bed edges (already computed)
    and plate depth, with the known tailgate height for scale.

    Returns meters_per_depth_unit, or None if calibration fails.
    """
    px1, py1, px2, py2 = plate_bbox_px
    bx1, by1, bx2, by2 = bed_bbox_px
    plate_width_px = px2 - px1
    plate_height_px = py2 - py1

    if plate_width_px <= 0:
        return None

    # m/pixel at plate distance (horizontal)
    m_per_pixel = PLATE_WIDTH_M / plate_width_px
    print(f"Plate: {plate_width_px}px wide → {m_per_pixel:.5f} m/pixel", file=sys.stderr)

    # Approach: Use bed bbox top edge depth (後板上端 = floor level)
    # vs plate center depth (後板外面, closer to camera).
    # The bed top edge in pixels is at by1. The plate center is at (py1+py2)/2.
    # The vertical distance in pixels between these × m_per_pixel = real vertical distance.
    # But we need the DEPTH axis (distance from camera), not the vertical axis.

    # Simpler and more robust approach:
    # Sample depth at bed top edge (left/right sides, away from cargo center)
    # and depth at plate center. The plate sticks out toward the camera relative
    # to the bed floor. The real-world distance is ~TAILGATE_HEIGHT_M (0.30m)
    # vertically, but the depth difference tells us the camera-axis offset.

    # Most robust: measure depth at bed-edge near the tailgate side (bottom of bed bbox)
    # vs depth at plate. Both are on the tailgate plane, different heights.
    # bed bbox bottom edge (by2) ≈ 後板上端 at rear of truck
    # plate top (py1) ≈ lower part of 後板 at rear of truck
    # Vertical separation: (py1 - by2) pixels × m_per_pixel ≈ 0 to small (they're close)
    # But depth difference: plate face is closer to camera than bed floor at the same column.

    # Actually the most direct calibration:
    # We know TAILGATE_HEIGHT_M = 0.30m (height of tailgate from bed floor to top).
    # In the image, bed bbox bottom edge (y2) and some point BELOW it differ by this height.
    # The bed bottom edge = tailgate top. Below it = tailgate bottom = near plate top.
    # depth at tailgate top (bed y2 edge) vs depth at plate area:
    #   tailgate top is at the same depth as the bed floor (same surface)
    #   plate is on the outer face, same depth plane as tailgate outer surface
    #   → depth difference is negligible (both on the tailgate plane, just different height)

    # The REAL calibration we can do:
    # Use the bed EDGE depth as floor reference (depth_floor) and the cargo peaks.
    # The plate just gives us m_per_pixel for the height axis.
    # For depth axis, use bed edge depth variance: left-edge vs right-edge depth difference
    # corresponds to bed_width (~2.06m) at some angle.

    # SIMPLEST working approach: use plate m_per_pixel for ALL axes.
    # The depth map is relative, so we convert cargo_height (in depth units)
    # to real meters by assuming: at the plate's distance from camera,
    # 1 depth unit ≈ some fraction of a meter. We calibrate by sampling
    # the bed edge (floor level) and the highest cargo point, then use
    # bed dimensions to cross-check.

    # Practical calibration: depth at bed left edge vs right edge.
    # These are at the same real height but different real depths (perspective).
    # The real horizontal distance = bed_width (2.06m for 4t).
    # But we'd need bed_width as input, and the depth difference is along camera axis...

    # Let's just use m_per_pixel directly as the depth scale.
    # For a roughly overhead or 45-degree view, this is a reasonable first-order
    # approximation. The depth map values represent relative inverse distance,
    # so we need to be careful.

    # FINAL practical approach: Use bed bbox edges to establish scale.
    # bed top edge (by1) = 後板上端 at front of bed (farther from camera)
    # bed bottom edge (by2) = 後板上端 at rear of bed (closer to camera)
    # The real distance between them ≈ bed_length projected onto camera axis.
    # But we don't know the viewing angle...

    # OK, let's just directly use m_per_pixel as height scale.
    # cargo_height is in depth units. We need meters_per_depth_unit.
    # Estimate: sample the depth gradient across the plate vertically.
    # The plate is ~0.165m tall (standard Japanese plate = 165mm).
    # plate_height_px pixels correspond to 0.165m.
    # The depth across the flat plate should be ~constant, but the
    # vertical gradient in the depth map across the plate tells us
    # how depth units map to vertical meters at that distance.

    # But the plate is flat (same depth everywhere), so depth gradient
    # across it is just noise/perspective distortion.

    # MOST DIRECT: compare ground (below truck) depth vs plate depth.
    # Ground is at a known position (ground plane). The plate is at
    # ground_clearance (~0.5m for 4t dump) above ground.
    # ground_depth < plate_depth (ground is farther in overhead-ish view).

    # Sample ground below the plate
    ground_y_start = min(py2 + plate_height_px, depth_map.shape[0] - 1)
    ground_y_end = min(ground_y_start + plate_height_px, depth_map.shape[0])
    plate_cx = (px1 + px2) // 2
    sample_half = max(1, plate_width_px // 4)
    sx1 = max(0, plate_cx - sample_half)
    sx2 = min(img_w, plate_cx + sample_half)

    if ground_y_end <= ground_y_start or sx2 <= sx1:
        print("WARNING: Cannot sample ground region.", file=sys.stderr)
        return None

    # Plate center depth (on the tailgate face)
    plate_cy = (py1 + py2) // 2
    plate_margin = max(1, plate_height_px // 4)
    plate_depth = float(np.median(
        depth_map[plate_cy - plate_margin:plate_cy + plate_margin, sx1:sx2]
    ))

    # Ground depth (below the truck, behind the plate)
    ground_depth = float(np.median(
        depth_map[ground_y_start:ground_y_end, sx1:sx2]
    ))

    # Bed edge depth (後板上端 = floor level, near the rear of bed)
    # Use the bottom portion of bed bbox near the plate
    bed_bottom_margin = max(3, (by2 - by1) // 10)
    bed_edge_y1 = max(by1, by2 - bed_bottom_margin)
    bed_edge_depth = float(np.median(
        depth_map[bed_edge_y1:by2, sx1:sx2]
    ))

    print(f"Plate depth: {plate_depth:.4f} (y≈{plate_cy})", file=sys.stderr)
    print(f"Ground depth: {ground_depth:.4f} (y≈{ground_y_start}-{ground_y_end})", file=sys.stderr)
    print(f"Bed edge depth: {bed_edge_depth:.4f} (y≈{bed_edge_y1}-{by2})", file=sys.stderr)

    # The plate is on the tailgate outer surface, the bed edge is the tailgate inner top.
    # Depth difference (bed_edge - plate) corresponds to roughly the 後板 thickness in
    # the camera depth direction, which is small.
    # More useful: plate is at a known height above ground.
    # plate_height_above_ground ≈ 0.8m for 4t dump (rough estimate).
    # But this requires knowing ground clearance.

    # Use bed-edge vs plate depth for tailgate-based calibration.
    # The bed edge (top of 後板, inside) is at the same height as the cargo floor.
    # Plate center (outside 後板) is at roughly the midpoint of the 後板.
    # The vertical distance from bed floor to plate center ≈ TAILGATE_HEIGHT_M / 2 = 0.15m
    # But the depth difference is in the camera axis, not vertical.

    # Let's try: bed_edge_depth vs plate_depth.
    # bed edge (inside top of 後板) should be FARTHER from camera than plate (outside face)
    # → bed_edge_depth < plate_depth (smaller depth = farther)
    depth_diff_edge_plate = plate_depth - bed_edge_depth
    print(f"Depth diff (plate - bed_edge): {depth_diff_edge_plate:.4f}", file=sys.stderr)

    # For ground-based calibration:
    # plate is closer to camera than ground → plate_depth > ground_depth
    depth_diff_plate_ground = plate_depth - ground_depth
    print(f"Depth diff (plate - ground): {depth_diff_plate_ground:.4f}", file=sys.stderr)

    # Use whichever pair gives a positive, meaningful calibration.
    # Ground clearance for 4t dump ≈ 0.25m (ground to truck frame bottom)
    # Plate center above ground ≈ 0.5m (rough)
    # But exact value uncertain. Better to use bed_edge approach.

    # bed_edge is at the cargo floor level. cargo_height is measured from floor.
    # If we know the real vertical distance between bed_edge and some reference,
    # we can calibrate. But we don't have a clean pair.

    # FALLBACK: use m_per_pixel as an approximation for meters_per_depth_unit.
    # This assumes the depth map's relative scale roughly matches pixel scale
    # at the distance of the truck. It's crude but at least gives us something
    # proportional.

    # Better: use bed bbox height in pixels vs known bed_height (0.32m for 4t).
    # bed bbox top edge (by1) = 後板上端 (front of bed, farther)
    # bed bbox bottom edge (by2) = 後板上端 (rear of bed, closer)
    # Depth difference between by1 and by2 strips = camera-axis distance
    # covered by bed_length at viewing angle.
    # This doesn't directly give us height calibration either.

    # FINAL SIMPLE APPROACH: Just use m_per_pixel.
    # depth_map values from Depth Anything V2 are in "relative inverse depth" units.
    # After interpolation they're metric-less. But the relative scale IS consistent
    # within an image. So: the number of depth units across the plate (which is flat)
    # in the horizontal direction should be ~0. The number of depth units vertically
    # between bed floor and cargo top IS proportional to real height.
    # We just need ONE known depth-unit ↔ meter pair.

    # Use the plate m_per_pixel and assume depth units scale similarly.
    # This works if the depth model produces roughly metric output (Depth Anything V2
    # does output metric-scale depth when fine-tuned, but the "Small" variant outputs
    # relative depth).

    # For relative depth: the ratio between any two depth differences equals
    # the ratio between the real distances. So if we have ANY known pair,
    # we can calibrate.

    # Known pair: bed top edge (by1 strip) vs bed bottom edge (by2 strip).
    # Real distance between them along camera axis = bed_length * cos(elevation_angle).
    # We don't know elevation_angle, but we can compute it:
    # In image, bed_length covers (by2 - by1) pixels vertically.
    # At plate distance: (by2 - by1) * m_per_pixel = bed_length * sin(elevation_angle)
    # → sin(θ) = (by2 - by1) * m_per_pixel / bed_length

    bed_height_px = by2 - by1
    bed_length_m = 3.4  # hardcoded for 4t, TODO: pass as param

    # Depth at front of bed (top of bbox = farther from camera)
    front_strip = depth_map[by1:by1 + bed_bottom_margin, bx1:bx2]
    front_depth = float(np.median(front_strip))

    # Depth at rear of bed (bottom of bbox = closer to camera)
    rear_strip = depth_map[by2 - bed_bottom_margin:by2, bx1:bx2]
    rear_depth = float(np.median(rear_strip))

    depth_diff_front_rear = rear_depth - front_depth
    print(f"Bed front depth: {front_depth:.4f}, rear depth: {rear_depth:.4f}, diff: {depth_diff_front_rear:.4f}", file=sys.stderr)

    if depth_diff_front_rear <= 0.01:
        print("WARNING: bed front/rear depth diff too small for calibration.", file=sys.stderr)
        # Fall back to simple pixel-based estimate
        meters_per_depth_unit = m_per_pixel
        print(f"Using m_per_pixel as depth scale: {meters_per_depth_unit:.5f}", file=sys.stderr)
        return meters_per_depth_unit

    # sin(θ) = vertical_span_in_meters / bed_length
    vertical_span_m = bed_height_px * m_per_pixel
    sin_theta = min(1.0, vertical_span_m / bed_length_m)
    cos_theta = (1 - sin_theta ** 2) ** 0.5
    # Real depth span of bed = bed_length * cos(θ)
    real_depth_span = bed_length_m * cos_theta

    meters_per_depth_unit = real_depth_span / depth_diff_front_rear
    print(f"Viewing angle: θ≈{np.degrees(np.arcsin(sin_theta)):.1f}°", file=sys.stderr)
    print(f"Real depth span: {real_depth_span:.3f}m over {depth_diff_front_rear:.4f} depth units", file=sys.stderr)
    print(f"Calibration: {meters_per_depth_unit:.5f} m/depth_unit", file=sys.stderr)
    return meters_per_depth_unit


def compute_floor_plane(
    depth_map: np.ndarray,
    x1: int, y1: int, x2: int, y2: int,
) -> np.ndarray:
    """Compute per-row floor depth using left/right edge strips.

    The bed floor depth varies along Y due to perspective (front of bed is
    farther from camera = lower depth, rear is closer = higher depth).
    For each row, sample left and right edge strips to estimate the floor
    depth at that Y position. Interior pixels exceeding this are cargo.

    Returns a 2D array (same shape as bed region) with estimated floor depth
    at each pixel position.
    """
    height = y2 - y1
    width = x2 - x1
    margin = max(3, width // 20)  # edge strip width

    # Per-row floor depth from left+right edges
    row_floor = np.zeros(height, dtype=np.float64)
    for r in range(height):
        y = y1 + r
        left_vals = depth_map[y, x1:x1 + margin]
        right_vals = depth_map[y, x2 - margin:x2]
        edge_vals = np.concatenate([left_vals, right_vals])
        row_floor[r] = np.median(edge_vals)

    # Smooth the per-row floor estimate to reduce noise
    from scipy.ndimage import uniform_filter1d
    row_floor_smooth = uniform_filter1d(row_floor, size=max(3, height // 10))

    # Expand to 2D (broadcast across columns)
    floor_plane = np.tile(row_floor_smooth[:, np.newaxis], (1, width))

    front_depth = float(row_floor_smooth[0])
    rear_depth = float(row_floor_smooth[-1])
    print(f"Floor plane: front={front_depth:.4f}, rear={rear_depth:.4f}, "
          f"gradient={(rear_depth - front_depth) / height:.5f}/px",
          file=sys.stderr)
    return floor_plane


def compute_cargo_height_map(
    depth_map: np.ndarray,
    floor_plane: np.ndarray,
    x1: int, y1: int, x2: int, y2: int,
    bed_height_m: float = 0.32,
) -> tuple[np.ndarray, float | None]:
    """Compute cargo height map within the bounding box, in meters.

    The floor_plane is at rim level (後板上端). The actual bed floor is
    bed_height_m below this. We use the depth difference between rim and
    bed interior minimum to calibrate depth units → meters.

    Strategy:
    1. delta = depth - floor_plane (negative = below rim, positive = above rim)
    2. P5 of delta ≈ bed floor (deepest visible point inside the bed)
    3. |P5| in depth units corresponds to bed_height_m (0.32m for 4t)
    4. meters_per_depth_unit = bed_height_m / |P5|
    5. cargo_height_m = (delta - P5) * meters_per_depth_unit
       (shifts so bed floor = 0m, converts to real meters)

    Returns (cargo_height_m, meters_per_depth_unit).
    """
    bed_region = depth_map[y1:y2, x1:x2].copy()
    delta = bed_region - floor_plane

    # Apply median filter first to reduce noise
    delta = median_filter(delta, size=3)

    # P5 of interior pixels = approximate bed floor depth relative to rim
    # Use interior only (exclude edges which define the floor plane)
    h, w = delta.shape
    margin_y = max(3, h // 10)
    margin_x = max(3, w // 10)
    interior = delta[margin_y:-margin_y, margin_x:-margin_x]

    p5 = float(np.percentile(interior, 5))
    print(f"Delta stats: min={delta.min():.4f}, P5={p5:.4f}, P50={np.median(delta):.4f}, "
          f"P95={np.percentile(delta, 95):.4f}, max={delta.max():.4f}",
          file=sys.stderr)

    if p5 < 0:
        # Bed floor visible below rim: |P5| depth units = bed_height_m
        meters_per_depth_unit = bed_height_m / abs(p5)
        floor_offset = p5  # shift so bed floor = 0
        print(f"Calibration: bed floor visible (P5={p5:.4f} → {bed_height_m}m)", file=sys.stderr)
    else:
        # Bed floor NOT visible (fully loaded, cargo covers everything)
        # delta=0 is at rim level = bed_height_m above floor.
        # Use the visible cargo range to estimate scale.
        # The range P5..P95 represents variation in cargo above rim.
        # We need a known reference: the rim-to-floor distance IS bed_height_m.
        # Since P5 > 0, all visible cargo is ABOVE rim.
        # We can still use the edge-to-interior depth gradient for scale.
        # Alternative: use the same scale from other calibrated images.
        #
        # Heuristic: if the image is fully loaded, the P5 (lowest cargo)
        # is near rim level (delta ≈ 0). Use P5 as the rim offset and
        # estimate that the delta range 0..P95 spans roughly 0..0.3m
        # (typical mountain cargo above rim).
        # Better: use total range (P5..P95) and assign it a reasonable height.
        # For fully loaded 4t dump: cargo height above floor ≈ 0.3-0.5m,
        # above rim ≈ 0-0.2m. Total visible range ≈ 0.2m.
        p95 = float(np.percentile(interior, 95))
        visible_range = p95 - p5
        if visible_range <= 0:
            return np.zeros_like(delta), None

        # The visible range is the cargo variation above rim.
        # For a mountain load, this is roughly TAILGATE_HEIGHT_M (0.30m)
        # above rim. Use this as the upper bound reference.
        meters_per_depth_unit = TAILGATE_HEIGHT_M / visible_range
        floor_offset = -bed_height_m / meters_per_depth_unit  # virtual floor position
        print(f"Calibration: bed floor hidden (P5={p5:.4f}, P95={p95:.4f}, "
              f"range={visible_range:.4f} → {TAILGATE_HEIGHT_M}m)", file=sys.stderr)

    print(f"Depth scale: {meters_per_depth_unit:.5f} m/depth_unit", file=sys.stderr)

    # Max realistic cargo height above bed floor (hinge at 0.6m, mountain can exceed slightly)
    max_cargo_height_m = 0.80

    # Shift so that bed floor = 0, then convert to meters
    cargo_height_m = (delta - floor_offset) * meters_per_depth_unit
    cargo_height_m = np.clip(cargo_height_m, 0.0, max_cargo_height_m)

    print(f"Cargo height (m): max={cargo_height_m.max():.3f}, "
          f"mean={cargo_height_m.mean():.3f}",
          file=sys.stderr)
    return cargo_height_m, meters_per_depth_unit


def compute_volume_grid(
    cargo_height_m: np.ndarray,
    bed_length: float,
    bed_width: float,
    grid_rows: int = 10,
    grid_cols: int = 20,
) -> tuple[float, float]:
    """Compute volume using grid-based integration.

    cargo_height_m is already in meters (calibrated by compute_cargo_height_map).

    Returns (estimated_volume_m3, avg_height_m).
    """
    h, w = cargo_height_m.shape
    if h == 0 or w == 0:
        return 0.0, 0.0

    # Grid-based volume computation
    cell_length = bed_length / grid_cols
    cell_width = bed_width / grid_rows
    cell_area = cell_length * cell_width

    cell_h = h / grid_rows
    cell_w = w / grid_cols

    total_volume = 0.0
    for r in range(grid_rows):
        for c in range(grid_cols):
            r_start = int(r * cell_h)
            r_end = int((r + 1) * cell_h)
            c_start = int(c * cell_w)
            c_end = int((c + 1) * cell_w)
            cell_region = cargo_height_m[r_start:r_end, c_start:c_end]
            if cell_region.size == 0:
                continue
            total_volume += cell_area * float(cell_region.mean())

    avg_height_m = float(cargo_height_m.mean())
    return total_volume, avg_height_m


def main():
    parser = argparse.ArgumentParser(
        description="Depth-map-based volume estimation for dump truck cargo"
    )
    parser.add_argument("image_path", help="Path to truck image")
    parser.add_argument(
        "--truck-class", default="4t",
        help="Truck class (2t, 4t, 増トン, 10t). Default: 4t"
    )
    parser.add_argument(
        "--material", default="As殻",
        help="Material type. Default: As殻"
    )
    parser.add_argument(
        "--packing-density", type=float, default=0.7,
        help="Packing density (0.5-0.9). Default: 0.7"
    )
    args = parser.parse_args()

    # Validate inputs
    image_path = args.image_path
    if not Path(image_path).exists():
        print(f"Error: Image not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    truck_specs = load_truck_specs()
    if args.truck_class not in truck_specs:
        print(
            f"Error: Unknown truck class '{args.truck_class}'. "
            f"Available: {list(truck_specs.keys())}",
            file=sys.stderr,
        )
        sys.exit(1)

    spec = truck_specs[args.truck_class]
    bed_length = spec["bedLength"]
    bed_width = spec["bedWidth"]

    density = MATERIAL_DENSITIES.get(args.material)
    if density is None:
        print(
            f"Error: Unknown material '{args.material}'. "
            f"Available: {list(MATERIAL_DENSITIES.keys())}",
            file=sys.stderr,
        )
        sys.exit(1)

    packing_density = args.packing_density

    # Step 1: Generate depth map
    depth_map, image = generate_depth_map(image_path)
    img_h, img_w = depth_map.shape

    # Step 2: Get truck bed + license plate bounding boxes (1 Gemini call)
    regions = query_gemini_regions(image_path)
    bbox_norm = regions.get("bedBox")
    plate_norm = regions.get("plateBox")

    if bbox_norm is None:
        print("bedBox not detected, using fallback (center 60%)", file=sys.stderr)
        bbox_norm = [0.2, 0.2, 0.8, 0.8]

    # Convert bed bbox to pixel coordinates
    x1 = max(0, min(int(bbox_norm[0] * img_w), img_w - 1))
    y1 = max(0, min(int(bbox_norm[1] * img_h), img_h - 1))
    x2 = max(x1 + 1, min(int(bbox_norm[2] * img_w), img_w))
    y2 = max(y1 + 1, min(int(bbox_norm[3] * img_h), img_h))
    print(f"Bed bbox (pixels): [{x1}, {y1}, {x2}, {y2}]", file=sys.stderr)

    bed_height = spec["bedHeight"]  # 後板高さ (rim to floor)
    calibration_method = f"floor_plane_bed_height_{bed_height}m"

    # Step 3: Compute floor plane (per-row floor depth with perspective correction)
    floor_plane = compute_floor_plane(depth_map, x1, y1, x2, y2)

    # Step 4: Compute cargo height map in meters (calibrated from bed_height)
    cargo_height_m, depth_scale = compute_cargo_height_map(
        depth_map, floor_plane, x1, y1, x2, y2, bed_height_m=bed_height
    )

    # Step 5: Volume calculation via grid method
    volume, avg_height_m = compute_volume_grid(
        cargo_height_m, bed_length, bed_width
    )

    # Step 6: Tonnage calculation
    tonnage = volume * density * packing_density

    # Depth stats
    bed_region = depth_map[y1:y2, x1:x2]
    floor_front = float(floor_plane[0, 0])
    floor_rear = float(floor_plane[-1, 0])
    depth_stats = {
        "min": round(float(depth_map.min()), 4),
        "max": round(float(depth_map.max()), 4),
        "mean_in_bed": round(float(bed_region.mean()), 4),
        "floor_front": round(floor_front, 4),
        "floor_rear": round(floor_rear, 4),
    }

    result = {
        "method": "depth-volume",
        "calibration": calibration_method,
        "truck_class": args.truck_class,
        "material_type": args.material,
        "packing_density": packing_density,
        "density": density,
        "bed_bbox_normalized": [round(v, 4) for v in bbox_norm],
        "plate_bbox_normalized": [round(v, 4) for v in plate_norm] if plate_norm else None,
        "bed_height_m": bed_height,
        "depth_scale": round(depth_scale, 5) if depth_scale else None,
        "floor_front": depth_stats["floor_front"],
        "floor_rear": depth_stats["floor_rear"],
        "avg_cargo_height_m": round(avg_height_m, 4),
        "estimated_volume_m3": round(volume, 4),
        "estimated_tonnage": round(tonnage, 2),
        "depth_stats": depth_stats,
    }

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
