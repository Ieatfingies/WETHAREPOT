import json
import os
import time
from pathlib import Path
from typing import Dict, List
import numpy as np

from ml.evaluation.evaluator import (
    compute_metrics_2d,
    evaluate_persistence_baseline,
    evaluate_trajectory_rollout,
)
from ml.evaluation.run_evaluation import (
    evaluate_model_on_split,
    evaluate_persistence_on_split,
    evaluate_rainfall_accumulation_on_split,
    load_dataset_trajectories,
    HORIZONS_STEPS,
    HORIZONS_SECONDS,
)
from ml.evaluation.benchmark_solver_vs_surrogate import compare_solver_and_surrogate
from ml.evaluation.generate_visualizations import (
    plot_training_curves,
    plot_rollout_horizon_errors,
    plot_spatial_comparison,
    plot_volume_conservation,
)
from ml.inference.predict_experimental import SurrogateRolloutEngine


def print_horizon_table(title: str, results_dict: Dict):
    print(f"\n=======================================================")
    print(f"{title}")
    print(f"=======================================================")
    header = f"{'Model':48s} | {'Horizon':8s} | {'MAE_all':8s} | {'MAE_wet':8s} | {'RMSE_all':8s} | {'Signed':8s} | {'IoU':6s} | {'Recall':6s} | {'Vol Err %':9s}"
    print(header)
    print("-" * len(header))

    for label, res in results_dict.items():
        summary = res["summary_horizons"]
        for s_idx, sec in [(1, 60), (2, 120), (5, 300), (10, 600), (15, 900), (20, 1200), (25, 1500), (30, 1800)]:
            h_key = f"step_{s_idx}"
            if h_key in summary:
                m = summary[h_key]
                print(
                    f"{label:48s} | {sec:6d}s | {m.get('mae_h_full', m['mae_h']):8.4f} | {m.get('mae_h_wet', 0.0):8.4f} | "
                    f"{m.get('rmse_h_full', m['rmse_h']):8.4f} | {m['signed_depth_error']:+8.4f} | "
                    f"{m['iou']:6.4f} | {m['recall']:6.4f} | {m['relative_volume_error']*100:8.2f}%"
                )
        print("-" * len(header))


def run_all_benchmarks():
    val_dir = "data/processed/dataset_clean/val"
    test_dir = "data/processed/dataset_clean/test"
    untouched_dir = "data/processed/dataset_clean/test_untouched_varthur"

    models_to_test = [
        ("Persistence (Zero-Change)", "persistence", False, "none"),
        ("Rainfall Accumulation Baseline", "rainfall_accum", False, "none"),
        ("Original U-Net (Pre-upgrade)", "ml/weights/unet_flood.pth", False, "none"),
        ("Baseline U-Net Legacy", "ml/weights/baseline_unet_legacy.pth", False, "none"),
        ("Clean PINN ResUNet V1 (Flux Projected)", "ml/weights/exp_clean_multiscale_pinn.pth", True, "flux"),
        ("Clean PINN ResUNet V2 (Optimised 3-Step, Flux)", "ml/weights/exp_clean_multiscale_pinn_v2.pth", True, "flux"),
    ]

    print("\n--- STAGE 1: VALIDATION EVALUATION (HSR Layout & Whitefield) ---")
    val_results = {}
    for label, ckpt, proj, pmode in models_to_test:
        if ckpt == "persistence":
            val_results[label] = evaluate_persistence_on_split(val_dir, horizons=HORIZONS_STEPS)
        elif ckpt == "rainfall_accum":
            val_results[label] = evaluate_rainfall_accumulation_on_split(val_dir, horizons=HORIZONS_STEPS)
        elif os.path.isfile(ckpt):
            print(f"Evaluating {label} on Val...")
            val_results[label] = evaluate_model_on_split(
                ckpt, val_dir, horizons=HORIZONS_STEPS, project_mass=proj, projection_mode=pmode
            )
        else:
            print(f"Skipping {label} (checkpoint not found: {ckpt})")

    print_horizon_table("VALIDATION EVALUATION (60s to 1800s)", val_results)

    print("\n--- STAGE 2: HELD-OUT TEST EVALUATION (Koramangala 30, 60, 95, 130 mm/hr) ---")
    test_results = {}
    for label, ckpt, proj, pmode in models_to_test:
        if ckpt == "persistence":
            test_results[label] = evaluate_persistence_on_split(test_dir, horizons=HORIZONS_STEPS)
        elif ckpt == "rainfall_accum":
            test_results[label] = evaluate_rainfall_accumulation_on_split(test_dir, horizons=HORIZONS_STEPS)
        elif os.path.isfile(ckpt):
            print(f"Evaluating {label} on Held-Out Test (Koramangala)...")
            test_results[label] = evaluate_model_on_split(
                ckpt, test_dir, horizons=HORIZONS_STEPS, project_mass=proj, projection_mode=pmode
            )
        else:
            print(f"Skipping {label} (checkpoint not found)")

    print_horizon_table("HELD-OUT TEST EVALUATION (KORAMANGALA)", test_results)

    print("\n--- STAGE 3: UNTOUCHED PRISTINE TEST EVALUATION (Varthur 30, 60, 95, 130 mm/hr) ---")
    untouched_results = {}
    for label, ckpt, proj, pmode in models_to_test:
        if ckpt == "persistence":
            untouched_results[label] = evaluate_persistence_on_split(untouched_dir, horizons=HORIZONS_STEPS)
        elif ckpt == "rainfall_accum":
            untouched_results[label] = evaluate_rainfall_accumulation_on_split(untouched_dir, horizons=HORIZONS_STEPS)
        elif os.path.isfile(ckpt):
            print(f"Evaluating {label} on Untouched Test (Varthur)...")
            untouched_results[label] = evaluate_model_on_split(
                ckpt, untouched_dir, horizons=HORIZONS_STEPS, project_mass=proj, projection_mode=pmode
            )
        else:
            print(f"Skipping {label} (checkpoint not found)")

    print_horizon_table("UNTOUCHED PRISTINE TEST EVALUATION (VARTHUR)", untouched_results)

    print("\n--- STAGE 4: C++ NUMERICAL SOLVER VS NEW PINN SURROGATE BENCHMARK ---")
    best_ckpt = "ml/weights/exp_clean_multiscale_pinn_v2.pth"
    solver_benchmark = compare_solver_and_surrogate(
        checkpoint_path=best_ckpt,
        region="koramangala",
        rain_mmhr=95.0,
        duration_s=1800.0,
        save_interval_s=60.0,
    )

    # Generate updated comparison plots
    print("\n--- STAGE 5: GENERATING COMPARISON VISUALIZATIONS ---")
    out_plot_dir = "data/processed/evaluation_plots"
    os.makedirs(out_plot_dir, exist_ok=True)
    plot_training_curves(out_dir=out_plot_dir)
    plot_rollout_horizon_errors(val_results, out_dir=out_plot_dir)

    # Spatial plot on Koramangala 95 mm/hr final frame
    test_trajs = load_dataset_trajectories(test_dir)
    kora_95 = test_trajs.get(("koramangala", 95.0), [])
    if kora_95:
        last_frame = kora_95[-1]
        gt_h = last_frame["y"][0]
        dem = last_frame["x"][0]
        mask = last_frame["x"][1]
        rough = last_frame["x"][2]
        persist_h = last_frame["x"][3]

        engine = SurrogateRolloutEngine(best_ckpt)
        rollout_res = engine.rollout(
            dem=dem,
            building_mask=mask,
            roughness=rough,
            rain_mmhr=95.0,
            steps=30,
            project_mass=True,
            projection_mode="flux",
        )
        pred_h = rollout_res["h_frames"][-1]

        best_ckpt = "ml/weights/exp_clean_multiscale_pinn_v3.pth" if os.path.isfile("ml/weights/exp_clean_multiscale_pinn_v3.pth") else "ml/weights/exp_clean_multiscale_pinn_v2.pth"
        title_suffix = f"Koramangala 95mm/hr @ 30min ({os.path.basename(best_ckpt)})"

        plot_spatial_comparison(
            gt_h=gt_h,
            pred_h=pred_h,
            persist_h=persist_h,
            mask=mask,
            dem=dem,
            title_suffix=title_suffix,
            out_dir=out_plot_dir,
        )

        gt_volumes = [float((f["y"][0] * 100.0 * (mask < 0.5)).sum()) for f in kora_95]
        gt_volumes = [0.0] + gt_volumes
        plot_volume_conservation(
            actual_volumes=rollout_res["volumes"],
            expected_volumes=rollout_res["expected_volumes"],
            solver_volumes=gt_volumes,
            out_dir=out_plot_dir,
        )

    # Save comprehensive final report
    best_model_name = "exp_clean_multiscale_pinn_v2.pth"
    report_data = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "best_model": best_model_name,
        "validation_evaluation": val_results,
        "test_evaluation": test_results,
        "untouched_test_evaluation": untouched_results,
        "solver_benchmark": solver_benchmark,
    }

    report_path = "ml/evaluation/final_optimised_benchmark_report.json"
    with open(report_path, "w") as f:
        json.dump(report_data, f, indent=2)
    print(f"\nFinal benchmark report saved to {report_path}!")


if __name__ == "__main__":
    run_all_benchmarks()
