import json
import os
import subprocess
import time
from pathlib import Path

import numpy as np

from ml.evaluation.evaluator import compute_metrics_2d
from ml.inference.predict_experimental import SurrogateRolloutEngine

SOLVER_BIN = "build/swe_solver_exp"


def run_solver_benchmark(
    npz_path: str,
    rain_mmhr: float,
    duration_s: float = 1800.0,
    save_interval_s: float = 60.0,
    bc_mode: str = "closed",
    temp_dir: str = "data/processed/tmp_benchmark_sim",
) -> dict:
    in_dir = os.path.join(temp_dir, "in")
    out_dir = os.path.join(temp_dir, "out")
    os.makedirs(in_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    data = np.load(npz_path)
    dem = data["dem"].astype(np.float32)
    mask = data["building_mask"].astype(np.float32)
    rough = data["roughness"].astype(np.float32)

    dem.tofile(os.path.join(in_dir, "dem.bin"))
    mask.tofile(os.path.join(in_dir, "mask.bin"))
    rough.tofile(os.path.join(in_dir, "rough.bin"))

    t0 = time.perf_counter()
    cmd = [
        SOLVER_BIN,
        in_dir,
        out_dir,
        str(dem.shape[0]),
        "10.0",
        str(rain_mmhr),
        str(duration_s),
        str(save_interval_s),
        bc_mode,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    solver_wall_time_ms = (time.perf_counter() - t0) * 1000.0

    # Load final frame
    n_frames = int(duration_s // save_interval_s)
    last_frame_idx = n_frames - 1
    h_final = np.fromfile(
        f"{out_dir}/frame_{last_frame_idx:04d}_h.bin", dtype=np.float32
    ).reshape(dem.shape)
    u_final = np.fromfile(
        f"{out_dir}/frame_{last_frame_idx:04d}_u.bin", dtype=np.float32
    ).reshape(dem.shape)
    v_final = np.fromfile(
        f"{out_dir}/frame_{last_frame_idx:04d}_v.bin", dtype=np.float32
    ).reshape(dem.shape)

    diag_file = os.path.join(out_dir, "mass_balance.json")
    mass_diag = {}
    if os.path.isfile(diag_file):
        with open(diag_file) as f:
            mass_diag = json.load(f)

    return {
        "solver_wall_time_ms": solver_wall_time_ms,
        "h_final": h_final,
        "u_final": u_final,
        "v_final": v_final,
        "mass_diagnostics": mass_diag,
    }


def compare_solver_and_surrogate(
    checkpoint_path: str,
    region: str = "koramangala",
    rain_mmhr: float = 95.0,
    duration_s: float = 1800.0,
    save_interval_s: float = 60.0,
) -> dict:
    npz_path = f"data/processed/{region}_256.npz"
    if not os.path.isfile(npz_path):
        from geospatial.grid_generation.builder import build_region_grids
        npz_path = build_region_grids(region_id=region, grid_size=256, resolution_m=10.0)

    print(f"\n[BENCHMARK] Running C++ Solver on {region} @ {rain_mmhr} mm/hr ({duration_s}s)...")
    solver_res = run_solver_benchmark(
        npz_path=npz_path,
        rain_mmhr=rain_mmhr,
        duration_s=duration_s,
        save_interval_s=save_interval_s,
    )

    data = np.load(npz_path)
    dem = data["dem"].astype(np.float32)
    mask = data["building_mask"].astype(np.float32)
    rough = data["roughness"].astype(np.float32)

    print(f"[BENCHMARK] Running ML Surrogate Rollout on {region} @ {rain_mmhr} mm/hr...")
    engine = SurrogateRolloutEngine(checkpoint_path)
    steps = int(duration_s // save_interval_s)
    surrogate_res = engine.rollout(
        dem=dem,
        building_mask=mask,
        roughness=rough,
        rain_mmhr=rain_mmhr,
        steps=steps,
    )

    surr_h_final = surrogate_res["h_frames"][-1]
    surr_u_final = surrogate_res["u_frames"][-1]
    surr_v_final = surrogate_res["v_frames"][-1]

    metrics = compute_metrics_2d(
        pred_h=surr_h_final,
        true_h=solver_res["h_final"],
        pred_u=surr_u_final,
        true_u=solver_res["u_final"],
        pred_v=surr_v_final,
        true_v=solver_res["v_final"],
        mask=mask,
    )

    t_solver = solver_res["solver_wall_time_ms"]
    t_surrogate = surrogate_res["total_rollout_time_ms"]
    speedup = t_solver / max(1e-3, t_surrogate)

    benchmark_summary = {
        "region": region,
        "rain_mmhr": rain_mmhr,
        "duration_s": duration_s,
        "solver_runtime_ms": t_solver,
        "surrogate_runtime_ms": t_surrogate,
        "surrogate_step_latency_ms": surrogate_res["mean_step_latency_ms"],
        "speedup_factor": speedup,
        "metrics_at_final_frame": metrics,
        "solver_mass_diagnostics": solver_res["mass_diagnostics"],
    }

    print(f"\n--- BENCHMARK RESULTS ---")
    print(f"Solver Runtime:    {t_solver:.2f} ms")
    print(f"Surrogate Runtime: {t_surrogate:.2f} ms ({surrogate_res['mean_step_latency_ms']:.2f} ms/step)")
    print(f"SPEEDUP:           {speedup:.1f}x")
    print(f"Final Depth MAE:   {metrics['mae_h']:.4f} m | RMSE: {metrics['rmse_h']:.4f} m | R²: {metrics['r2_h']:.4f}")
    print(f"Flood Extent IoU:  {metrics['iou']:.4f} | Precision: {metrics['precision']:.4f} | Recall: {metrics['recall']:.4f}")
    print(f"Volume Error:      {metrics['volume_error_m3']:.2f} m^3 ({metrics['relative_volume_error']*100:.2f}%)")

    return benchmark_summary
