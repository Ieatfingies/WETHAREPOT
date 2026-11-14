import json
import os
import time
from pathlib import Path
import numpy as np

from ml.evaluation.evaluator import (
    compute_metrics_2d,
    evaluate_persistence_baseline,
    evaluate_trajectory_rollout,
)
from ml.evaluation.run_evaluation import (
    evaluate_model_on_split,
    evaluate_persistence_on_split,
    load_dataset_trajectories,
)
from ml.evaluation.benchmark_solver_vs_surrogate import compare_solver_and_surrogate
from ml.evaluation.generate_visualizations import (
    plot_training_curves,
    plot_rollout_horizon_errors,
    plot_spatial_comparison,
    plot_volume_conservation,
)
from ml.inference.predict_experimental import SurrogateRolloutEngine


def run_full_suite():
    val_dir = "data/processed/dataset_experimental/val"
    test_dir = "data/processed/dataset_experimental/test"
    models_to_eval = [
        ("Original U-Net (Pre-upgrade)", "ml/weights/unet_flood.pth"),
        ("Baseline U-Net Legacy Loss", "ml/weights/baseline_unet_legacy.pth"),
        ("U-Net Base16 + Composite PINN", "ml/weights/exp_unet_base16_composite.pth"),
        ("U-Net Base32 + Composite PINN", "ml/weights/exp_unet_base32_composite.pth"),
        ("ResUNet + Composite PINN", "ml/weights/exp_res_unet_composite.pth"),
        ("Multiscale ResUNet + Composite PINN", "ml/weights/exp_multiscale_res_unet_composite.pth"),
    ]

    print("\n=======================================================")
    print("STAGE 1: VALIDATION EVALUATION ACROSS ALL ARCHITECTURES")
    print("=======================================================")

    val_results = {}

    # Persistence baseline
    print("[Eval] Evaluating Persistence baseline on Val...")
    val_results["Persistence (Zero-Change)"] = evaluate_persistence_on_split(val_dir)

    for label, ckpt in models_to_eval:
        if os.path.isfile(ckpt):
            print(f"[Eval] Evaluating {label} ({ckpt}) on Val...")
            val_results[label] = evaluate_model_on_split(ckpt, val_dir)
        else:
            print(f"[Eval] Warning: Checkpoint not found: {ckpt}")

    # Generate training curves plot
    plot_training_curves()

    # Compare 30-min horizon on validation
    print("\n--- VALIDATION RESULTS (HORIZON: 30 MINUTES) ---")
    print(f"{'Model':42s} | {'MAE (m)':8s} | {'RMSE (m)':8s} | {'R²':6s} | {'IoU':6s} | {'Vol Err %':9s}")
    print("-" * 92)

    best_model_label = None
    best_model_ckpt = None
    best_val_mae = float("inf")

    for label, res in val_results.items():
        m30 = res["summary_horizons"]["step_30"]
        print(f"{label:42s} | {m30['mae_h']:8.4f} | {m30['rmse_h']:8.4f} | {m30['r2_h']:6.4f} | {m30['iou']:6.4f} | {m30['relative_volume_error']*100:8.2f}%")

        if "Persistence" not in label:
            if m30["mae_h"] < best_val_mae:
                best_val_mae = m30["mae_h"]
                best_model_label = label
                best_model_ckpt = res.get("checkpoint")

    print(f"\n--> BEST VALIDATION MODEL: {best_model_label} ({best_model_ckpt}) with 30-min MAE: {best_val_mae:.4f}m")

    # Generate rollout horizon error curve
    plot_rollout_horizon_errors(val_results)

    print("\n=======================================================")
    print("STAGE 2: HELD-OUT TEST EVALUATION (KORAMANGALA)")
    print("=======================================================")
    test_results = {}
    print("[Eval] Evaluating Persistence baseline on Koramangala Test...")
    test_results["Persistence (Zero-Change)"] = evaluate_persistence_on_split(test_dir)

    # Evaluate original baseline on test
    if os.path.isfile("ml/weights/unet_flood.pth"):
        print("[Eval] Evaluating Original U-Net on Koramangala Test...")
        test_results["Original U-Net"] = evaluate_model_on_split("ml/weights/unet_flood.pth", test_dir)

    # Evaluate best model on test
    if best_model_ckpt and os.path.isfile(best_model_ckpt):
        print(f"[Eval] Evaluating Best Model ({best_model_label}) on Koramangala Test...")
        test_results[best_model_label] = evaluate_model_on_split(best_model_ckpt, test_dir)

    print("\n--- HELD-OUT KORAMANGALA TEST RESULTS (30 MINUTES) ---")
    print(f"{'Model':42s} | {'MAE (m)':8s} | {'RMSE (m)':8s} | {'R²':6s} | {'IoU':6s} | {'Vol Err %':9s}")
    print("-" * 92)
    for label, res in test_results.items():
        m30 = res["summary_horizons"]["step_30"]
        print(f"{label:42s} | {m30['mae_h']:8.4f} | {m30['rmse_h']:8.4f} | {m30['r2_h']:6.4f} | {m30['iou']:6.4f} | {m30['relative_volume_error']*100:8.2f}%")

    print("\n=======================================================")
    print("STAGE 3: DIRECT C++ SOLVER VS SURROGATE BENCHMARK")
    print("=======================================================")
    eval_ckpt = best_model_ckpt if best_model_ckpt else "ml/weights/unet_flood.pth"
    solver_benchmark = compare_solver_and_surrogate(
        checkpoint_path=eval_ckpt,
        region="koramangala",
        rain_mmhr=95.0,
        duration_s=1800.0,
        save_interval_s=60.0,
    )

    # Generate spatial flood depth comparison plot
    test_trajs = load_dataset_trajectories(test_dir)
    kora_95_frames = test_trajs.get(("koramangala", 95.0), [])
    if kora_95_frames:
        last_gt = kora_95_frames[-1]
        gt_h = last_gt["y"][0]
        dem = last_gt["x"][0]
        mask = last_gt["x"][1]
        persist_h = last_gt["x"][3]

        engine = SurrogateRolloutEngine(eval_ckpt)
        rollout = engine.rollout(
            dem=dem,
            building_mask=mask,
            roughness=last_gt["x"][2],
            rain_mmhr=95.0,
            steps=30,
        )
        pred_h = rollout["h_frames"][-1]

        plot_spatial_comparison(
            gt_h=gt_h,
            pred_h=pred_h,
            persist_h=persist_h,
            mask=mask,
            dem=dem,
            title_suffix="Koramangala 95mm/hr @ 30min",
        )

        # Plot volume curve
        gt_volumes = [float((f["y"][0] * 100.0 * (mask < 0.5)).sum()) for f in kora_95_frames]
        gt_volumes = [0.0] + gt_volumes
        plot_volume_conservation(
            actual_volumes=rollout["volumes"],
            expected_volumes=rollout["expected_volumes"],
            solver_volumes=gt_volumes,
        )

    # Save full report
    full_report = {
        "best_model_label": best_model_label,
        "best_model_checkpoint": best_model_ckpt,
        "validation_evaluation": val_results,
        "test_evaluation": test_results,
        "solver_benchmark": solver_benchmark,
    }

    report_path = "ml/evaluation/full_benchmark_report.json"
    with open(report_path, "w") as f:
        json.dump(full_report, f, indent=2)
    print(f"\nFull benchmark report successfully saved to {report_path}!")


if __name__ == "__main__":
    run_full_suite()
