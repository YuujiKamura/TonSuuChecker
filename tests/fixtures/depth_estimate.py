"""Depth Anything v2 - Small model test script."""
import numpy as np
from PIL import Image
import torch
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

INPUT_IMAGE = r"C:\Users\yuuji\TonSuuChecker\tests\fixtures\isuzu_white_1121_disposal.jpg"
OUTPUT_NPY = r"C:\Users\yuuji\TonSuuChecker\tests\fixtures\depth_test.npy"
OUTPUT_PNG = r"C:\Users\yuuji\TonSuuChecker\tests\fixtures\depth_test.png"

MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"

print(f"Loading model: {MODEL_ID}")
processor = AutoImageProcessor.from_pretrained(MODEL_ID)
model = AutoModelForDepthEstimation.from_pretrained(MODEL_ID)

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Device: {device}")
model = model.to(device)

print(f"Loading image: {INPUT_IMAGE}")
image = Image.open(INPUT_IMAGE).convert("RGB")
print(f"Image size: {image.size}")

inputs = processor(images=image, return_tensors="pt").to(device)

with torch.no_grad():
    outputs = model(**inputs)

# Get predicted depth
predicted_depth = outputs.predicted_depth

# Interpolate to original size
prediction = torch.nn.functional.interpolate(
    predicted_depth.unsqueeze(1),
    size=image.size[::-1],  # (H, W)
    mode="bicubic",
    align_corners=False,
).squeeze().cpu().numpy()

print(f"Depth map shape: {prediction.shape}")
print(f"Depth values - min: {prediction.min():.4f}, max: {prediction.max():.4f}, mean: {prediction.mean():.4f}")

# Save as numpy
np.save(OUTPUT_NPY, prediction)
print(f"Saved numpy: {OUTPUT_NPY}")

# Normalize for visualization and save as PNG
depth_norm = (prediction - prediction.min()) / (prediction.max() - prediction.min())
depth_vis = (depth_norm * 255).astype(np.uint8)
depth_img = Image.fromarray(depth_vis)
depth_img.save(OUTPUT_PNG)
print(f"Saved visualization: {OUTPUT_PNG}")

print("\nDone. Depth map is RELATIVE depth (not metric).")
print("Higher values = farther from camera, lower values = closer to camera.")
print("(Depth Anything v2 outputs inverse depth by default, but the HF pipeline normalizes it.)")
