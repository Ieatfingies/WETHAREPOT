import os
import shutil
import subprocess
import numpy as np
import matplotlib.pyplot as plt
from geospatial.grid_generation.builder import build_region_grids

DATASET_DIR = "data/processed/dataset"
TEMP_DIR = "data/processed/tmp_sim"
os.makedirs(DATASET_DIR, exist_ok=True)

# D01 & D09: Train/Val across 4 diverse Bengaluru catchments, hold out Koramangala completely for Test
TRAIN_REGIONS = ["bellandur", "hsr_layout", "mahadevapura", "whitefield"]
TEST_REGIONS = ["koramangala"]

# D02: Varied monsoon storm intensities (mm/hr)
RAIN_SCENARIOS_MMHR = [30.0, 60.0, 95.0, 130.0]

DURATION_S = 1800.0      # 30-minute storm simulation
SAVE_INTERVAL_S = 60.0   # 1-minute macro-steps (30 transitions per run)
GRID_SIZE = 256
DX_M = 10.0


def run_single_scenario(region_id: str, rain_mmhr: float, split: str, sample_offset: int) -> int:
    npz_path = build_region_grids(region_id=region_id, grid_size=GRID_SIZE, resolution_m=DX_M)
    geo = np.load(npz_path)
    dem = geo["dem"].astype(np.float32)
    mask = geo["building_mask"].astype(np.float32)
    rough = geo["roughness"].astype(np.float32)

    in_dir = os.path.join(TEMP_DIR, "in")
    out_dir = os.path.join(TEMP_DIR, "out")
    shutil.rmtree(TEMP_DIR, ignore_errors=True)
    os.makedirs(in_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    dem.tofile(os.path.join(in_dir, "dem.bin"))
    mask.tofile(os.path.join(in_dir, "mask.bin"))
    rough.tofile(os.path.join(in_dir, "rough.bin"))

    cmd = [
        "build/swe_solver.exe",
        in_dir,
        out_dir,
        str(GRID_SIZE),
        str(DX_M),
        str(rain_mmhr),
        str(DURATION_S),
        str(SAVE_INTERVAL_S),
    ]
    subprocess.run(cmd, check=True)

    n_frames = int(DURATION_S // SAVE_INTERVAL_S)
    rain_ms = np.full((GRID_SIZE, GRID_SIZE), rain_mmhr / 3_600_000.0, dtype=np.float32)

    # D03: Dry initial state at t=0
    h_prev = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)
    u_prev = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)
    v_prev = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)

    split_dir = os.path.join(DATASET_DIR, split)
    os.makedirs(split_dir, exist_ok=True)

    count = 0
    for f_idx in range(n_frames):
        prefix = os.path.join(out_dir, f"frame_{f_idx:04d}")
        h_next = np.fromfile(f"{prefix}_h.bin", dtype=np.float32).reshape(GRID_SIZE, GRID_SIZE)
        u_next = np.fromfile(f"{prefix}_u.bin", dtype=np.float32).reshape(GRID_SIZE, GRID_SIZE)
        v_next = np.fromfile(f"{prefix}_v.bin", dtype=np.float32).reshape(GRID_SIZE, GRID_SIZE)

        # D10: Dataset quality & physical validity check
        assert not np.isnan(h_next).any(), f"NaN detected in {region_id} @ {rain_mmhr}"
        assert (h_next >= 0.0).all(), f"Negative water depth in {region_id} @ {rain_mmhr}"

        # D06 & D07: Input X_t (7, H, W) and Target Y_{t+1} (3, H, W) per DATA_CONTRACT.md
        x_tensor = np.stack([dem, mask, rough, h_prev, u_prev, v_prev, rain_ms], axis=0)
        y_tensor = np.stack([h_next, u_next, v_next], axis=0)

        sample_path = os.path.join(split_dir, f"sample_{sample_offset + count:05d}.npz")
        np.savez_compressed(sample_path, x=x_tensor, y=y_tensor, region=region_id, rain_mmhr=rain_mmhr)

        h_prev, u_prev, v_prev = h_next, u_next, v_next
        count += 1

    # Save visual sanity-check image for Bellandur 95 mm/hr
    if region_id == "bellandur" and abs(rain_mmhr - 95.0) < 1e-3:
        fig, axes = plt.subplots(1, 2, figsize=(12, 5))
        im0 = axes[0].imshow(dem, cmap="terrain")
        axes[0].set_title("Bellandur DEM (m)")
        plt.colorbar(im0, ax=axes[0])

        im1 = axes[1].imshow(h_prev, cmap="Blues", vmin=0.0, vmax=max(0.5, float(h_prev.max())))
        axes[1].contour(mask, levels=[0.5], colors="red", linewidths=0.4)
        axes[1].set_title(f"Bellandur Flood Depth @ 30 min (max={h_prev.max():.2f}m)")
        plt.colorbar(im1, ax=axes[1])
        plt.tight_layout()
        plt.savefig("data/processed/bellandur_flood_preview.png", dpi=150)
        plt.close()
        print("[Dataset] Saved visual check -> data/processed/bellandur_flood_preview.png")

    return count


def main():
    train_idx = 0
    val_idx = 0
    for reg in TRAIN_REGIONS:
        for r_idx, rain in enumerate(RAIN_SCENARIOS_MMHR):
            if reg == "whitefield" and r_idx == 3:
                added = run_single_scenario(reg, rain, split="val", sample_offset=val_idx)
                val_idx += added
                print(f"[Dataset] VAL   | {reg} @ {rain} mm/hr -> +{added} samples")
            else:
                added = run_single_scenario(reg, rain, split="train", sample_offset=train_idx)
                train_idx += added
                print(f"[Dataset] TRAIN | {reg} @ {rain} mm/hr -> +{added} samples (total={train_idx})")

    test_idx = 0
    for reg in TEST_REGIONS:
        for rain in RAIN_SCENARIOS_MMHR:
            added = run_single_scenario(reg, rain, split="test", sample_offset=test_idx)
            test_idx += added
            print(f"[Dataset] TEST  | {reg} @ {rain} mm/hr -> +{added} samples (total={test_idx})")

    shutil.rmtree(TEMP_DIR, ignore_errors=True)
    print(f"\n[Dataset] COMPLETE! Train: {train_idx} | Val: {val_idx} | Test (Koramangala): {test_idx}")


if __name__ == "__main__":
    main()