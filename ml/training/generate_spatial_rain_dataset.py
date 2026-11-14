import json
import os
import shutil
import subprocess
import time
from pathlib import Path
import numpy as np

SOLVER_BIN = "build/swe_solver_exp"
DATASET_CLEAN_DIR = Path("data/processed/dataset_clean")
TEMP_DIR = Path("data/processed/tmp_spatial_gen")

GRID_SIZE = 256
DX_M = 10.0
DURATION_S = 1800.0
SAVE_INTERVAL_S = 60.0
N_FRAMES = int(DURATION_S // SAVE_INTERVAL_S)


def create_gaussian_field(
    center_x: float,
    center_y: float,
    sigma_m: float,
    peak_mmhr: float,
    grid_size: int = GRID_SIZE,
    dx_m: float = DX_M,
) -> np.ndarray:
    """
    Creates a 2D Gaussian rainfall field in mm/hr.
    """
    xs = np.arange(grid_size) * dx_m
    ys = np.arange(grid_size) * dx_m
    xx, yy = np.meshgrid(xs, ys)
    dist_sq = (xx - center_x) ** 2 + (yy - center_y) ** 2
    field = peak_mmhr * np.exp(-0.5 * dist_sq / (sigma_m ** 2))
    # Clip near-zero rain to exact zero (< 0.1 mm/hr)
    field = np.where(field < 0.1, 0.0, field).astype(np.float32)
    return field


def run_spatial_scenario(
    region_id: str,
    scenario_name: str,
    storm_type: str,  # 'moving' or 'stationary'
    peak_mmhr: float,
    sigma_m: float,
    split_dir: Path,
    start_sample_idx: int,
    start_pos: tuple = (400.0, 400.0),
    velocity_mps: tuple = (0.9, 0.7),
) -> int:
    npz_path = f"data/processed/{region_id}_256.npz"
    geo = np.load(npz_path)
    dem = geo["dem"].astype(np.float32)
    mask = geo["building_mask"].astype(np.float32)
    rough = geo["roughness"].astype(np.float32)

    in_dir = TEMP_DIR / f"{region_id}_{scenario_name}_in"
    out_dir = TEMP_DIR / f"{region_id}_{scenario_name}_out"
    shutil.rmtree(in_dir, ignore_errors=True)
    shutil.rmtree(out_dir, ignore_errors=True)
    in_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    dem.tofile(in_dir / "dem.bin")
    mask.tofile(in_dir / "mask.bin")
    rough.tofile(in_dir / "rough.bin")

    # Generate frame-by-frame spatial rain grids
    rain_grids_ms = []
    for f in range(N_FRAMES):
        sim_time_s = f * SAVE_INTERVAL_S
        if storm_type == "moving":
            cx = start_pos[0] + velocity_mps[0] * sim_time_s
            cy = start_pos[1] + velocity_mps[1] * sim_time_s
        else:
            cx, cy = start_pos

        field_mmhr = create_gaussian_field(cx, cy, sigma_m, peak_mmhr)
        field_ms = field_mmhr / 3_600_000.0  # convert to m/s
        rain_grids_ms.append(field_ms)

        bin_path = in_dir / f"rain_grid_{f:04d}.bin"
        field_ms.tofile(bin_path)

    # Run C++ SWE Solver
    cmd = [
        SOLVER_BIN,
        str(in_dir),
        str(out_dir),
        str(GRID_SIZE),
        str(DX_M),
        str(peak_mmhr),  # nominal rate for config
        str(DURATION_S),
        str(SAVE_INTERVAL_S),
        "open",  # OPEN_NO_INFLOW
    ]

    t0 = time.perf_counter()
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    sim_ms = (time.perf_counter() - t0) * 1000.0

    # Read mass balance
    with open(out_dir / "mass_balance.json") as f:
        mb = json.load(f)
    print(
        f"  [Simulated] {region_id} ({scenario_name}): {DURATION_S}s in {sim_ms:.1f}ms | "
        f"V_rain={mb['v_rain_m3']:.1f}m3, V_out={mb['v_outflow_m3']:.1f}m3, "
        f"Err={mb['volume_error_m3']:.3e}m3 ({mb['relative_error']*100:.4f}%)"
    )

    split_dir.mkdir(parents=True, exist_ok=True)
    h_prev = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)
    u_prev = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)
    v_prev = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)

    count = 0
    for f_idx in range(N_FRAMES):
        prefix = out_dir / f"frame_{f_idx:04d}"
        h_next = np.fromfile(f"{prefix}_h.bin", dtype=np.float32).reshape(GRID_SIZE, GRID_SIZE)
        u_next = np.fromfile(f"{prefix}_u.bin", dtype=np.float32).reshape(GRID_SIZE, GRID_SIZE)
        v_next = np.fromfile(f"{prefix}_v.bin", dtype=np.float32).reshape(GRID_SIZE, GRID_SIZE)

        assert not np.isnan(h_next).any(), f"NaN in {region_id} @ {scenario_name}"
        assert (h_next >= 0.0).all(), f"Negative depth in {region_id} @ {scenario_name}"
        assert (h_next[mask > 0.5] == 0.0).all(), f"Building leak in {region_id} @ {scenario_name}"

        rain_ms = rain_grids_ms[f_idx]
        x_tensor = np.stack([dem, mask, rough, h_prev, u_prev, v_prev, rain_ms], axis=0)
        y_tensor = np.stack([h_next, u_next, v_next], axis=0)

        sample_path = split_dir / f"sample_{start_sample_idx + count:05d}.npz"
        np.savez_compressed(
            sample_path,
            x=x_tensor,
            y=y_tensor,
            region=region_id,
            rain_mmhr=float(peak_mmhr),
            scenario_name=scenario_name,
        )

        h_prev, u_prev, v_prev = h_next, u_next, v_next
        count += 1

    shutil.rmtree(in_dir, ignore_errors=True)
    shutil.rmtree(out_dir, ignore_errors=True)
    return count


def main():
    print("=== GENERATING SPATIALLY VARYING RAINFALL SIMULATIONS (C++ SOLVER) ===")
    train_dir = DATASET_CLEAN_DIR / "train_spatial_rain"
    val_dir = DATASET_CLEAN_DIR / "val_spatial_rain"
    test_dir = DATASET_CLEAN_DIR / "test_spatial_rain"

    shutil.rmtree(train_dir, ignore_errors=True)
    shutil.rmtree(val_dir, ignore_errors=True)
    shutil.rmtree(test_dir, ignore_errors=True)

    # 1. Training Scenarios: 6 diverse moving and stationary storms across 4 training regions
    train_scenarios = [
        # Bellandur: Moving convective cell SW -> NE
        ("bellandur", "moving_sw_ne_120", "moving", 120.0, 380.0, (300.0, 300.0), (1.0, 0.9)),
        # Bellandur: Stationary localized cloudburst at center depression
        ("bellandur", "stationary_burst_130", "stationary", 130.0, 350.0, (1280.0, 1280.0), (0.0, 0.0)),
        # Mahadevapura: Moving cell W -> E
        ("mahadevapura", "moving_w_e_105", "moving", 105.0, 350.0, (200.0, 1280.0), (1.1, 0.1)),
        # Mahadevapura: Stationary localized burst
        ("mahadevapura", "stationary_burst_115", "stationary", 115.0, 400.0, (1400.0, 1100.0), (0.0, 0.0)),
        # Whitefield: Moving cell NW -> SE
        ("whitefield", "moving_nw_se_140", "moving", 140.0, 420.0, (300.0, 2200.0), (0.9, -0.8)),
        # HSR Layout: Moving cell S -> N
        ("hsr_layout", "moving_s_n_95", "moving", 95.0, 320.0, (1280.0, 300.0), (0.1, 1.0)),
    ]

    sample_idx = 0
    for reg, name, stype, peak, sig, spos, svel in train_scenarios:
        cnt = run_spatial_scenario(
            region_id=reg,
            scenario_name=name,
            storm_type=stype,
            peak_mmhr=peak,
            sigma_m=sig,
            split_dir=train_dir,
            start_sample_idx=sample_idx,
            start_pos=spos,
            velocity_mps=svel,
        )
        sample_idx += cnt
    print(f"Total training spatial samples generated: {sample_idx} ({sample_idx // N_FRAMES} trajectories)")

    # 2. Validation Scenarios: 2 spatial scenarios on held-out HSR Layout & Whitefield
    val_scenarios = [
        ("hsr_layout", "val_moving_diag_110", "moving", 110.0, 360.0, (400.0, 400.0), (0.8, 0.8)),
        ("whitefield", "val_stationary_burst_100", "stationary", 100.0, 380.0, (1100.0, 1400.0), (0.0, 0.0)),
    ]
    val_sample_idx = 0
    for reg, name, stype, peak, sig, spos, svel in val_scenarios:
        cnt = run_spatial_scenario(
            region_id=reg,
            scenario_name=name,
            storm_type=stype,
            peak_mmhr=peak,
            sigma_m=sig,
            split_dir=val_dir,
            start_sample_idx=val_sample_idx,
            start_pos=spos,
            velocity_mps=svel,
        )
        val_sample_idx += cnt
    print(f"Total validation spatial samples generated: {val_sample_idx} ({val_sample_idx // N_FRAMES} trajectories)")

    # 3. Test Scenarios: 2 spatial scenarios on held-out test catchments (Koramangala & Varthur)
    test_scenarios = [
        ("koramangala", "test_moving_kora_130", "moving", 130.0, 350.0, (300.0, 400.0), (0.9, 0.8)),
        ("varthur", "test_moving_varthur_100", "moving", 100.0, 400.0, (400.0, 300.0), (0.8, 0.9)),
    ]
    test_sample_idx = 0
    for reg, name, stype, peak, sig, spos, svel in test_scenarios:
        cnt = run_spatial_scenario(
            region_id=reg,
            scenario_name=name,
            storm_type=stype,
            peak_mmhr=peak,
            sigma_m=sig,
            split_dir=test_dir,
            start_sample_idx=test_sample_idx,
            start_pos=spos,
            velocity_mps=svel,
        )
        test_sample_idx += cnt
    print(f"Total test spatial samples generated: {test_sample_idx} ({test_sample_idx // N_FRAMES} trajectories)")

    # Clean up temp
    shutil.rmtree(TEMP_DIR, ignore_errors=True)
    print("=== SPATIAL RAINFALL DATASET GENERATION COMPLETE ===")


if __name__ == "__main__":
    main()
