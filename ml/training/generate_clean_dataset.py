import os
import shutil
import subprocess
import time
from pathlib import Path
import numpy as np

SOLVER_BIN = "build/swe_solver_exp"
DATASET_CLEAN_DIR = Path("data/processed/dataset_clean")
TEMP_DIR = Path("data/processed/tmp_clean_gen")

TRAIN_REGIONS = ["bellandur", "mahadevapura", "hsr_layout", "whitefield"]
TEST_REGIONS = ["koramangala"]
RAIN_SCENARIOS_MMHR = [30.0, 60.0, 95.0, 130.0]

VAL_TRAJECTORIES = {
    ("whitefield", 130.0),
    ("hsr_layout", 60.0),
}

GRID_SIZE = 256
DX_M = 10.0
DURATION_S = 1800.0
SAVE_INTERVAL_S = 60.0
N_FRAMES = int(DURATION_S // SAVE_INTERVAL_S)


def run_scenario(region_id: str, rain_mmhr: float, split: str, sample_offset: int) -> int:
    npz_path = f"data/processed/{region_id}_256.npz"
    if not os.path.isfile(npz_path):
        from geospatial.grid_generation.builder import build_region_grids
        npz_path = build_region_grids(region_id=region_id, grid_size=GRID_SIZE, resolution_m=DX_M)

    geo = np.load(npz_path)
    dem = geo["dem"].astype(np.float32)
    mask = geo["building_mask"].astype(np.float32)
    rough = geo["roughness"].astype(np.float32)

    in_dir = TEMP_DIR / f"{region_id}_{rain_mmhr:.0f}_in"
    out_dir = TEMP_DIR / f"{region_id}_{rain_mmhr:.0f}_out"
    shutil.rmtree(in_dir, ignore_errors=True)
    shutil.rmtree(out_dir, ignore_errors=True)
    in_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    dem.tofile(in_dir / "dem.bin")
    mask.tofile(in_dir / "mask.bin")
    rough.tofile(in_dir / "rough.bin")

    cmd = [
        SOLVER_BIN,
        str(in_dir),
        str(out_dir),
        str(GRID_SIZE),
        str(DX_M),
        str(rain_mmhr),
        str(DURATION_S),
        str(SAVE_INTERVAL_S),
        "open",  # OPEN_NO_INFLOW
    ]
    t0 = time.perf_counter()
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    sim_ms = (time.perf_counter() - t0) * 1000.0

    split_dir = DATASET_CLEAN_DIR / split
    split_dir.mkdir(parents=True, exist_ok=True)

    rain_ms = np.full((GRID_SIZE, GRID_SIZE), rain_mmhr / 3_600_000.0, dtype=np.float32)
    h_prev = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)
    u_prev = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)
    v_prev = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)

    count = 0
    for f_idx in range(N_FRAMES):
        prefix = out_dir / f"frame_{f_idx:04d}"
        h_next = np.fromfile(f"{prefix}_h.bin", dtype=np.float32).reshape(GRID_SIZE, GRID_SIZE)
        u_next = np.fromfile(f"{prefix}_u.bin", dtype=np.float32).reshape(GRID_SIZE, GRID_SIZE)
        v_next = np.fromfile(f"{prefix}_v.bin", dtype=np.float32).reshape(GRID_SIZE, GRID_SIZE)

        # Physical integrity checks
        assert not np.isnan(h_next).any(), f"NaN in {region_id} @ {rain_mmhr}"
        assert (h_next >= 0.0).all(), f"Negative depth in {region_id} @ {rain_mmhr}"
        assert (h_next[mask > 0.5] == 0.0).all(), f"Building leak in {region_id} @ {rain_mmhr}"

        x_tensor = np.stack([dem, mask, rough, h_prev, u_prev, v_prev, rain_ms], axis=0)
        y_tensor = np.stack([h_next, u_next, v_next], axis=0)

        sample_path = split_dir / f"sample_{sample_offset + count:05d}.npz"
        np.savez_compressed(
            sample_path,
            x=x_tensor,
            y=y_tensor,
            region=region_id,
            rain_mmhr=rain_mmhr,
        )

        h_prev, u_prev, v_prev = h_next, u_next, v_next
        count += 1

    shutil.rmtree(in_dir, ignore_errors=True)
    shutil.rmtree(out_dir, ignore_errors=True)

    fluid = (mask < 0.5)
    final_vol = float((h_prev[fluid] * 100.0).sum())
    rain_vol = float((rain_mmhr / 3_600_000.0) * DURATION_S * 100.0 * fluid.sum())
    print(f"[{split.upper():5s}] {region_id:14s} @ {rain_mmhr:5.1f} mm/hr -> Vol: {final_vol:9.1f} m³ (Rain: {rain_vol:9.1f} m³, Ratio: {final_vol/max(rain_vol,1.0):.2f}x) in {sim_ms:.0f} ms")
    return count


def main():
    if not os.path.isfile(SOLVER_BIN):
        raise RuntimeError(f"Solver binary not found: {SOLVER_BIN}")

    DATASET_CLEAN_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    counts = {"train": 0, "val": 0, "test": 0}

    print("\n--- GENERATING CLEAN PHYSICALLY CONSERVED DATASET ---")
    # Training and validation regions
    for reg in TRAIN_REGIONS:
        for rain in RAIN_SCENARIOS_MMHR:
            split = "val" if (reg, rain) in VAL_TRAJECTORIES else "train"
            added = run_scenario(reg, rain, split, sample_offset=counts[split])
            counts[split] += added

    # Test region (Koramangala)
    for reg in TEST_REGIONS:
        for rain in RAIN_SCENARIOS_MMHR:
            added = run_scenario(reg, rain, "test", sample_offset=counts["test"])
            counts["test"] += added

    shutil.rmtree(TEMP_DIR, ignore_errors=True)
    print("\n--- CLEAN DATASET GENERATION COMPLETE ---")
    print(f"Train: {counts['train']} frames (14 trajectories)")
    print(f"Val:   {counts['val']} frames (2 trajectories)")
    print(f"Test:  {counts['test']} frames (4 trajectories)")
    assert counts["train"] == 420
    assert counts["val"] == 60
    assert counts["test"] == 120


if __name__ == "__main__":
    main()
