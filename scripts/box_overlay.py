"""Geometry-calibrated volume estimation.

Detect tailgate boundaries and cargo top via AI, convert to meters using
tailgate height as scale reference, then estimate fill ratios separately.
MAE ~0.35t on 7-image GT set (ensemble=3).
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CLI_AI_ANALYZER = r"C:\Users\yuuji\cli-ai-analyzer\target\release\cli-ai-analyzer.exe"
SPEC_PATH = Path(r"C:\Users\yuuji\TonSuuChecker\prompt-spec.json")

# License plate real dimensions (Japanese large vehicle plate)
PLATE_WIDTH_M = 0.440
PLATE_HEIGHT_M = 0.165

# Material densities
MATERIAL_DENSITIES = {"土砂": 1.8, "As殻": 2.5, "Co殻": 2.5, "開粒度As殻": 2.35}


def load_spec():
    with open(SPEC_PATH, encoding="utf-8") as f:
        return json.load(f)


def call_gemini(prompt: str, image_path: str, model: str = "gemini-3-flash-preview") -> str:
    cmd = [
        CLI_AI_ANALYZER, "analyze", "--json",
        "--model", model, "--prompt", prompt, image_path,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        print(f"CLI error: {r.stderr[-300:]}", file=sys.stderr)
        return ""
    return r.stdout.strip()


def parse_json(raw: str) -> dict:
    raw = re.sub(r"```(?:json)?\s*", "", raw).strip()
    raw = re.sub(r"\s*```\s*$", "", raw).strip()
    b = raw.find("{")
    e = raw.rfind("}") + 1
    if b >= 0 and e > b:
        return json.loads(raw[b:e])
    return json.loads(raw)


def detect_geometry(image_path: str) -> dict:
    """Detect plate bbox, tailgate boundaries, and cargo top via Gemini."""
    prompt = (
        'Output ONLY JSON: {"plateBox":[x1,y1,x2,y2], "tailgateTopY": 0.0, "tailgateBottomY": 0.0, "cargoTopY": 0.0} '
        "This is a rear view of a dump truck carrying construction debris. "
        "plateBox = bounding box of the rear license plate (normalized 0-1, [left,top,right,bottom]). "
        "tailgateTopY = Y coordinate (normalized 0-1) of the TOP edge of the tailgate (後板上端/rim). "
        "tailgateBottomY = Y coordinate (normalized 0-1) of the BOTTOM edge of the tailgate (後板下端). "
        "cargoTopY = Y coordinate (normalized 0-1) of the HIGHEST point of the cargo pile. "
        "The tailgate is the flat metal panel at the rear of the truck bed. "
        "tailgateTopY < tailgateBottomY < plateBox[3] (top has smaller Y). "
        "cargoTopY < tailgateTopY if cargo is heaped above the rim. "
        "cargoTopY > tailgateTopY if cargo is below the rim. "
        "All coordinates normalized 0.0-1.0."
    )
    raw = call_gemini(prompt, image_path)
    if not raw:
        return {}
    try:
        return parse_json(raw)
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Detection failed: {e}", file=sys.stderr)
        return {}


def draw_height_markers(
    image: Image.Image,
    plate_box: list[float],
    tailgate_top_y: float,
    tailgate_bottom_y: float,
    bed_height_m: float,
    markers: list[tuple[float, str, str]],
) -> Image.Image:
    """Draw horizontal height markers using tailgate as calibration.

    The tailgate (後板) spans from tailgate_bottom_y to tailgate_top_y.
    tailgate_bottom_y ≈ bed floor level.
    tailgate_top_y ≈ bed floor + bed_height_m (後板上端 = 0.32m for 4t).
    We use the tailgate pixel height to calibrate m/pixel (more reliable than plate).

    plate_box: [x1, y1, x2, y2] normalized (for horizontal extent).
    tailgate_top_y, tailgate_bottom_y: normalized Y coordinates.
    markers: [(height_m, label, color), ...]
    """
    w, h = image.size
    img = image.copy()
    draw = ImageDraw.Draw(img)

    # Plate bbox in pixels (used for horizontal extent and scale backup)
    px1 = int(plate_box[0] * w)
    py1 = int(plate_box[1] * h)
    px2 = int(plate_box[2] * w)
    py2 = int(plate_box[3] * h)
    plate_w_px = px2 - px1
    if plate_w_px <= 0:
        return img

    # Tailgate in pixels
    tg_top_px = int(tailgate_top_y * h)
    tg_bot_px = int(tailgate_bottom_y * h)
    tg_height_px = tg_bot_px - tg_top_px  # positive (bot > top in image coords)

    if tg_height_px <= 0:
        print("WARNING: tailgate height <= 0, falling back to plate scale", file=sys.stderr)
        # Fallback: use plate width for scale
        m_per_pixel = PLATE_WIDTH_M / plate_w_px
        bed_floor_y = py1
    else:
        # Calibrate m/pixel from tailgate height (= bed_height_m)
        m_per_pixel = bed_height_m / tg_height_px
        bed_floor_y = tg_bot_px  # 後板下端 = bed floor

    plate_m_per_pixel = PLATE_WIDTH_M / plate_w_px
    print(f"Plate: {plate_w_px}px, plate_m/px={plate_m_per_pixel:.5f}", file=sys.stderr)
    print(f"Tailgate: {tg_height_px}px ({tg_top_px}-{tg_bot_px}), tg_m/px={m_per_pixel:.5f}", file=sys.stderr)
    print(f"Bed floor Y: {bed_floor_y}px", file=sys.stderr)

    # Draw plate outline
    draw.rectangle([px1, py1, px2, py2], outline="white", width=2)
    # Draw tailgate boundaries
    draw.rectangle([px1 - 10, tg_top_px, px2 + 10, tg_bot_px], outline="cyan", width=2)

    # Font
    try:
        font = ImageFont.truetype("arial.ttf", max(16, int(h * 0.022)))
    except (OSError, IOError):
        font = ImageFont.load_default()

    # Horizontal extent for the markers: use a wide area centered on the bed
    bed_cx = (px1 + px2) // 2
    marker_half_w = int(plate_w_px * 2.5)
    mx1 = max(0, bed_cx - marker_half_w)
    mx2 = min(w, bed_cx + marker_half_w)

    for height_m, label, color in markers:
        y_offset_px = height_m / m_per_pixel
        marker_y = int(bed_floor_y - y_offset_px)  # above plate top = toward top of image

        if 0 <= marker_y < h:
            # Dashed-style line (draw segments)
            dash_len = 12
            for x in range(mx1, mx2, dash_len * 2):
                x_end = min(x + dash_len, mx2)
                draw.line([(x, marker_y), (x_end, marker_y)], fill=color, width=3)

            # Label with background
            text = f" {label} "
            bbox = draw.textbbox((0, 0), text, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            label_x = mx2 + 4
            label_y = marker_y - th // 2
            draw.rectangle([label_x, label_y - 2, label_x + tw + 4, label_y + th + 2], fill="black")
            draw.text((label_x + 2, label_y), text, fill=color, font=font)

    # Draw bed floor reference line
    draw.line([(mx1, bed_floor_y), (mx2, bed_floor_y)], fill="blue", width=2)
    lbl = " 床面 0m "
    bbox_lbl = draw.textbbox((0, 0), lbl, font=font)
    draw.rectangle([mx2 + 4, bed_floor_y - 10, mx2 + 4 + (bbox_lbl[2] - bbox_lbl[0]) + 4, bed_floor_y + 10], fill="black")
    draw.text((mx2 + 6, bed_floor_y - 8), lbl, fill="blue", font=font)

    return img


def estimate_fill(image_path: str) -> dict | None:
    """Ask Gemini to estimate fill and packing parameters from original image."""
    prompt = (
        'Output ONLY JSON: {"fillRatioL": 0.0, "fillRatioW": 0.0, "packingDensity": 0.0, "reasoning": "..."} '
        "This is a rear view of a dump truck carrying construction debris (As殻 = asphalt chunks). "
        "Estimate each parameter INDEPENDENTLY: "
        "fillRatioL (0.3~0.9): fraction of the bed LENGTH occupied by cargo. "
        "Dump trucks are loaded from above; cargo forms a mound that rarely reaches the very front/rear. "
        "Full load with cargo touching both ends = 0.85-0.9. Normal load = 0.6-0.8. Light load = 0.4-0.6. "
        "fillRatioW (0.5~1.0): fraction of the bed WIDTH covered by cargo at the top surface. "
        "Usually 0.8-1.0 since cargo spreads across the width. "
        "packingDensity (0.5~0.9): how tightly packed the debris chunks are. "
        "As殻 = asphalt pavement chunks (~5cm thick). "
        "Large chunks thrown in loosely with visible gaps = 0.5-0.6, moderate = 0.65-0.7, tightly packed = 0.8-0.9."
    )
    raw = call_gemini(prompt, image_path)
    if not raw:
        return None
    try:
        return parse_json(raw)
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Fill parse error: {e}", file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser(description="Geometry-calibrated volume estimation")
    parser.add_argument("image_path")
    parser.add_argument("--truck-class", default="4t")
    parser.add_argument("--material", default="As殻")
    parser.add_argument("--save-overlay", help="Save annotated image path")
    parser.add_argument("--ensemble", type=int, default=2, help="Number of geometry detection runs")
    args = parser.parse_args()

    if not Path(args.image_path).exists():
        print(f"Error: not found: {args.image_path}", file=sys.stderr)
        sys.exit(1)

    spec = load_spec()
    truck = spec["truckSpecs"].get(args.truck_class)
    if not truck:
        print(f"Unknown truck class: {args.truck_class}", file=sys.stderr)
        sys.exit(1)

    density = MATERIAL_DENSITIES.get(args.material)
    if not density:
        print(f"Unknown material: {args.material}", file=sys.stderr)
        sys.exit(1)

    bed_height = truck["bedHeight"]  # 後板高さ (m)
    bed_length = truck["bedLength"]
    bed_width = truck["bedWidth"]

    # Step 1: Detect geometry (ensemble, take median of height_m)
    height_m_list = []
    last_det = {}
    for run_i in range(args.ensemble):
        print(f"Step 1: Detecting geometry (run {run_i+1}/{args.ensemble})...", file=sys.stderr)
        det = detect_geometry(args.image_path)
        plate_box = det.get("plateBox")
        if not plate_box or len(plate_box) != 4:
            print(f"  Plate not detected, skip", file=sys.stderr)
            continue
        tg_top = det.get("tailgateTopY", 0.0)
        tg_bot = det.get("tailgateBottomY", 0.0)
        cargo_top = det.get("cargoTopY", 0.0)
        print(f"  plate={plate_box}, tg_top={tg_top:.3f}, tg_bot={tg_bot:.3f}, cargo_top={cargo_top:.3f}", file=sys.stderr)

        if tg_top <= 0 or tg_bot <= 0 or tg_top >= tg_bot:
            print("  WARNING: tailgate detection invalid, skip", file=sys.stderr)
            continue

        # Convert cargoTopY to height in meters above bed floor
        # bed_floor_y = tg_bot (normalized), tailgate top = tg_top
        # tailgate height in norm coords = tg_bot - tg_top
        # This corresponds to bed_height meters
        tg_height_norm = tg_bot - tg_top
        m_per_norm = bed_height / tg_height_norm

        # cargo height = distance from bed floor (tg_bot) to cargo top (cargoTopY)
        # In image coords, up = smaller Y, so height = tg_bot - cargoTopY
        cargo_height_norm = tg_bot - cargo_top
        cargo_height_m = cargo_height_norm * m_per_norm
        cargo_height_m = max(0.0, min(cargo_height_m, 0.8))

        print(f"  tg_h_norm={tg_height_norm:.4f}, m/norm={m_per_norm:.3f}, cargo_h={cargo_height_m:.3f}m", file=sys.stderr)
        height_m_list.append(cargo_height_m)
        last_det = det

    if not height_m_list:
        print("Geometry detection failed on all runs", file=sys.stderr)
        sys.exit(1)

    # Take median height
    height_m_list.sort()
    height_m = height_m_list[len(height_m_list) // 2]
    print(f"Height estimates: {[round(h,3) for h in height_m_list]} → median={height_m:.3f}m", file=sys.stderr)

    # Optional: save debug overlay
    if args.save_overlay:
        image = Image.open(args.image_path).convert("RGB")
        plate_box = last_det.get("plateBox", [0,0,0,0])
        tg_top = last_det.get("tailgateTopY", 0)
        tg_bot = last_det.get("tailgateBottomY", 0)
        markers = [
            (0.10, "0.10m", "#888888"),
            (0.20, "0.20m", "#888888"),
            (0.30, "0.30m 後板", "lime"),
            (0.40, "0.40m", "yellow"),
            (0.50, "0.50m", "orange"),
            (0.60, "0.60m ヒンジ", "red"),
        ]
        annotated = draw_height_markers(image, plate_box, tg_top, tg_bot, bed_height, markers)
        annotated.save(args.save_overlay, quality=92)
        print(f"Overlay saved: {args.save_overlay}", file=sys.stderr)

    # Step 2: Estimate fill ratios (from original image, ensemble)
    fills = []
    for run_i in range(args.ensemble):
        print(f"Step 2: Estimating fill (run {run_i+1}/{args.ensemble})...", file=sys.stderr)
        fill = estimate_fill(args.image_path)
        if fill:
            fills.append(fill)
            print(f"  L={fill.get('fillRatioL')}, W={fill.get('fillRatioW')}, p={fill.get('packingDensity')}", file=sys.stderr)
    if not fills:
        print("Fill estimation failed", file=sys.stderr)
        sys.exit(1)

    def avg_param(key, default, lo, hi):
        vals = [min(max(float(f.get(key, default)), lo), hi) for f in fills]
        return sum(vals) / len(vals)

    fill_l = avg_param("fillRatioL", 0.7, 0.0, 1.0)
    fill_w = avg_param("fillRatioW", 0.8, 0.0, 1.0)
    packing = avg_param("packingDensity", 0.7, 0.5, 0.9)
    reasoning = fills[0].get("reasoning", "")

    # Step 3: Tonnage
    # Shape factor: peak height overestimates volume because cargo is mound-shaped.
    # Empirical correction ~0.85 (between flat-top=1.0 and cone=0.33).
    shape_factor = 0.85
    volume = bed_length * bed_width * height_m * fill_l * fill_w * shape_factor
    tonnage = volume * density * packing

    result = {
        "method": "box-overlay",
        "truck_class": args.truck_class,
        "material_type": args.material,
        "plate_box": [round(v, 4) for v in last_det.get("plateBox", [])],
        "height_m": round(height_m, 3),
        "fill_ratio_l": round(fill_l, 3),
        "fill_ratio_w": round(fill_w, 3),
        "packing_density": round(packing, 3),
        "estimated_volume_m3": round(volume, 4),
        "estimated_tonnage": round(tonnage, 2),
        "density": density,
        "reasoning": reasoning,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
