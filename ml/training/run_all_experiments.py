import os
import sys
import json
from pathlib import Path
from ml.training.train_experimental import run_experiment


def run_all():
    experiments = [
        {
            "model_name": "unet_base16",
            "loss_mode": "legacy",
            "exp_name": "baseline_unet_legacy",
            "epochs": 8,
            "patience": 3,
            "lr": 1e-3,
        },
        {
            "model_name": "unet_base16",
            "loss_mode": "composite",
            "exp_name": "exp_unet_base16_composite",
            "epochs": 8,
            "patience": 3,
            "lr": 1e-3,
        },
        {
            "model_name": "unet_base32",
            "loss_mode": "composite",
            "exp_name": "exp_unet_base32_composite",
            "epochs": 8,
            "patience": 3,
            "lr": 1e-3,
        },
        {
            "model_name": "res_unet",
            "loss_mode": "composite",
            "exp_name": "exp_res_unet_composite",
            "epochs": 8,
            "patience": 3,
            "lr": 1e-3,
        },
        {
            "model_name": "multiscale_res_unet",
            "loss_mode": "composite",
            "exp_name": "exp_multiscale_res_unet_composite",
            "epochs": 8,
            "patience": 3,
            "lr": 1e-3,
        },
    ]

    results_summary = {}

    for exp in experiments:
        ckpt_path, best_val = run_experiment(
            model_name=exp["model_name"],
            loss_mode=exp["loss_mode"],
            epochs=exp["epochs"],
            batch_size=8,
            lr=exp["lr"],
            patience=exp["patience"],
            exp_name=exp["exp_name"],
            seed=42,
        )
        results_summary[exp["exp_name"]] = {
            "model": exp["model_name"],
            "loss": exp["loss_mode"],
            "checkpoint": str(ckpt_path),
            "best_val_loss": best_val,
        }

    summary_file = Path("ml/training/logs/all_experiments_summary.json")
    with open(summary_file, "w") as f:
        json.dump(results_summary, f, indent=2)

    print("\n================ ALL EXPERIMENTS COMPLETE ================")
    for k, v in results_summary.items():
        print(f"  {k:35s} | Best Val Loss: {v['best_val_loss']:.6f}")


if __name__ == "__main__":
    run_all()
