import glob
import json
import os
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np


def plot_training_curves(log_dir: str = "ml/training/logs", out_dir: str = "data/processed/evaluation_plots"):
    os.makedirs(out_dir, exist_ok=True)
    log_files = sorted(glob.glob(f"{log_dir}/exp_*.json") + glob.glob(f"{log_dir}/baseline_*.json"))
    if not log_files:
        return

    plt.figure(figsize=(10, 6))
    for f in log_files:
        with open(f) as fp:
            data = json.load(fp)
        exp_name = data.get("exp_name", Path(f).stem)
        hist = data.get("history", [])
        if not hist:
            continue
        epochs = [h["epoch"] for h in hist]
        val_losses = [h["val_loss"] for h in hist]
        plt.plot(epochs, val_losses, marker="o", label=f"{exp_name} (best={data.get('best_val_loss', 0):.4f})")

    plt.xlabel("Epoch")
    plt.ylabel("Validation Loss")
    plt.title("Convergence & Validation Loss across Model Architectures")
    plt.grid(True, linestyle="--", alpha=0.6)
    plt.legend(bbox_to_anchor=(1.04, 1), loc="upper left")
    plt.tight_layout()
    plt.savefig(f"{out_dir}/training_curves.png", dpi=150)
    plt.close()
    print(f"Saved {out_dir}/training_curves.png")


def plot_rollout_horizon_errors(
    results_dict: dict,
    out_dir: str = "data/processed/evaluation_plots",
):
    os.makedirs(out_dir, exist_ok=True)
    horizons = [1, 5, 10, 20, 30]

    plt.figure(figsize=(12, 5))

    # Subplot 1: Depth MAE
    plt.subplot(1, 2, 1)
    for model_name, res in results_dict.items():
        summary = res["summary_horizons"]
        maes = [summary[f"step_{h}"]["mae_h"] for h in horizons if f"step_{h}" in summary]
        plt.plot(horizons[:len(maes)], maes, marker="s", label=model_name)
    plt.xlabel("Forecast Horizon (minutes)")
    plt.ylabel("Water Depth MAE (m)")
    plt.title("Autoregressive Depth Error vs Horizon")
    plt.grid(True, linestyle="--", alpha=0.6)
    plt.legend()

    # Subplot 2: IoU
    plt.subplot(1, 2, 2)
    for model_name, res in results_dict.items():
        summary = res["summary_horizons"]
        ious = [summary[f"step_{h}"]["iou"] for h in horizons if f"step_{h}" in summary]
        plt.plot(horizons[:len(ious)], ious, marker="^", label=model_name)
    plt.xlabel("Forecast Horizon (minutes)")
    plt.ylabel("Flood Extent IoU (>5cm)")
    plt.title("Flood Extent IoU vs Horizon")
    plt.grid(True, linestyle="--", alpha=0.6)
    plt.legend()

    plt.tight_layout()
    plt.savefig(f"{out_dir}/rollout_horizon_errors.png", dpi=150)
    plt.close()
    print(f"Saved {out_dir}/rollout_horizon_errors.png")


def plot_spatial_comparison(
    gt_h: np.ndarray,
    pred_h: np.ndarray,
    persist_h: np.ndarray,
    mask: np.ndarray,
    dem: np.ndarray,
    title_suffix: str = "30-min",
    out_dir: str = "data/processed/evaluation_plots",
):
    os.makedirs(out_dir, exist_ok=True)
    fig, axes = plt.subplots(1, 4, figsize=(20, 5))

    vmax = max(0.5, float(gt_h.max()))

    im0 = axes[0].imshow(gt_h, cmap="Blues", vmin=0, vmax=vmax)
    axes[0].contour(mask, levels=[0.5], colors="red", linewidths=0.5)
    axes[0].set_title(f"Numerical Solver GT ({title_suffix})")
    plt.colorbar(im0, ax=axes[0], label="Depth (m)")

    im1 = axes[1].imshow(pred_h, cmap="Blues", vmin=0, vmax=vmax)
    axes[1].contour(mask, levels=[0.5], colors="red", linewidths=0.5)
    axes[1].set_title(f"ML Surrogate Prediction")
    plt.colorbar(im1, ax=axes[1], label="Depth (m)")

    err_map = np.abs(pred_h - gt_h)
    im2 = axes[2].imshow(err_map, cmap="inferno", vmin=0, vmax=max(0.2, float(err_map.max())))
    axes[2].set_title("Absolute Error Map (|Surr - GT|)")
    plt.colorbar(im2, ax=axes[2], label="Error (m)")

    persist_err = np.abs(persist_h - gt_h)
    im3 = axes[3].imshow(persist_err, cmap="inferno", vmin=0, vmax=max(0.2, float(err_map.max())))
    axes[3].set_title("Persistence Error (|Persist - GT|)")
    plt.colorbar(im3, ax=axes[3], label="Error (m)")

    for ax in axes:
        ax.set_xticks([])
        ax.set_yticks([])

    plt.tight_layout()
    plt.savefig(f"{out_dir}/spatial_flood_depth_comparison.png", dpi=150)
    plt.close()
    print(f"Saved {out_dir}/spatial_flood_depth_comparison.png")


def plot_volume_conservation(
    actual_volumes: list,
    expected_volumes: list,
    solver_volumes: list,
    out_dir: str = "data/processed/evaluation_plots",
):
    os.makedirs(out_dir, exist_ok=True)
    times = [i * 1.0 for i in range(len(actual_volumes))]

    plt.figure(figsize=(8, 5))
    plt.plot(times, solver_volumes, "k--", label="Numerical Solver", linewidth=2)
    plt.plot(times, expected_volumes, "g:", label="Expected (Rain Added)", linewidth=1.5)
    plt.plot(times, actual_volumes, "b-", label="ML Surrogate Rollout", linewidth=1.5)

    plt.xlabel("Simulation Time (minutes)")
    plt.ylabel("Domain Water Volume (m³)")
    plt.title("Mass Conservation & Water Volume Progression")
    plt.grid(True, linestyle="--", alpha=0.6)
    plt.legend()
    plt.tight_layout()
    plt.savefig(f"{out_dir}/volume_conservation_curve.png", dpi=150)
    plt.close()
    print(f"Saved {out_dir}/volume_conservation_curve.png")
