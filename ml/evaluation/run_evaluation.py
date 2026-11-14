import argparse
import glob
import json
import time
from pathlib import Path
from typing import Dict, List

import numpy as np

from ml.evaluation.evaluator import (
    compute_metrics_2d,
    evaluate_persistence_baseline,
    evaluate_trajectory_rollout,
)
from ml.inference.predict_experimental import SurrogateRolloutEngine


def load_dataset_trajectories(split_dir: str) -> Dict[tuple, List[Dict]]:
    trajectories = {}
    files = sorted(Path(split_dir).glob("*.npz"))
    for f in files:
        with np.load(f) as d:
            reg = str(d["region"])
            rain = float(d["rain_mmhr"])
            item = {
                "file": str(f),
                "region": reg,
                "rain_mmhr": rain,
                "x": d["x"],
                "y": d["y"],
            }
        key = (reg, rain)
        if key not in trajectories:
            trajectories[key] = []
        trajectories[key].append(item)
    return trajectories


def evaluate_model_on_split(
    checkpoint_path: str,
    split_dir: str,
    horizons: List[int] = [1, 5, 10, 20, 30],
) -> Dict:
    engine = SurrogateRolloutEngine(checkpoint_path)
    trajectories = load_dataset_trajectories(split_dir)

    all_results = {}
    aggregated_horizons = {f"step_{h}": [] for h in horizons}

    for (reg, rain), frames in trajectories.items():
        traj_res = evaluate_trajectory_rollout(engine, frames, horizons=horizons)
        all_results[f"{reg}_{rain:.0f}mmhr"] = traj_res
        for h_key, metrics in traj_res["horizon_metrics"].items():
            aggregated_horizons[h_key].append(metrics)

    # Average metrics per horizon
    summary_horizons = {}
    for h_key, metric_list in aggregated_horizons.items():
        summary_horizons[h_key] = {
            "mae_h": float(np.mean([m["mae_h"] for m in metric_list])),
            "rmse_h": float(np.mean([m["rmse_h"] for m in metric_list])),
            "r2_h": float(np.mean([m["r2_h"] for m in metric_list])),
            "mae_u": float(np.mean([m["mae_u"] for m in metric_list])),
            "mae_v": float(np.mean([m["mae_v"] for m in metric_list])),
            "rmse_speed": float(np.mean([m["rmse_speed"] for m in metric_list])),
            "iou": float(np.mean([m["iou"] for m in metric_list])),
            "precision": float(np.mean([m["precision"] for m in metric_list])),
            "recall": float(np.mean([m["recall"] for m in metric_list])),
            "relative_volume_error": float(np.mean([m["relative_volume_error"] for m in metric_list])),
            "building_violations": float(np.sum([m["building_violations"] for m in metric_list])),
            "negative_depth_count": float(np.sum([m["negative_depth_count"] for m in metric_list])),
        }

    return {
        "checkpoint": checkpoint_path,
        "load_time_ms": engine.load_time_ms,
        "summary_horizons": summary_horizons,
        "trajectories": all_results,
    }


def evaluate_persistence_on_split(
    split_dir: str,
    horizons: List[int] = [1, 5, 10, 20, 30],
) -> Dict:
    trajectories = load_dataset_trajectories(split_dir)
    aggregated_horizons = {f"step_{h}": [] for h in horizons}

    for (reg, rain), frames in trajectories.items():
        traj_res = evaluate_persistence_baseline(frames, horizons=horizons)
        for h_key, metrics in traj_res.items():
            aggregated_horizons[h_key].append(metrics)

    summary_horizons = {}
    for h_key, metric_list in aggregated_horizons.items():
        summary_horizons[h_key] = {
            "mae_h": float(np.mean([m["mae_h"] for m in metric_list])),
            "rmse_h": float(np.mean([m["rmse_h"] for m in metric_list])),
            "r2_h": float(np.mean([m["r2_h"] for m in metric_list])),
            "mae_u": float(np.mean([m["mae_u"] for m in metric_list])),
            "mae_v": float(np.mean([m["mae_v"] for m in metric_list])),
            "rmse_speed": float(np.mean([m["rmse_speed"] for m in metric_list])),
            "iou": float(np.mean([m["iou"] for m in metric_list])),
            "precision": float(np.mean([m["precision"] for m in metric_list])),
            "recall": float(np.mean([m["recall"] for m in metric_list])),
            "relative_volume_error": float(np.mean([m["relative_volume_error"] for m in metric_list])),
            "building_violations": float(np.sum([m["building_violations"] for m in metric_list])),
            "negative_depth_count": float(np.sum([m["negative_depth_count"] for m in metric_list])),
        }

    return {"summary_horizons": summary_horizons}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=str, required=True)
    parser.add_argument("--split-dir", type=str, default="data/processed/dataset_experimental/val")
    parser.add_argument("--out-json", type=str, default=None)
    args = parser.parse_args()

    print(f"Evaluating checkpoint: {args.checkpoint} on {args.split_dir}...")
    results = evaluate_model_on_split(args.checkpoint, args.split_dir)
    print("\n--- EVALUATION SUMMARY ACROSS HORIZONS ---")
    for step, metrics in results["summary_horizons"].items():
        print(f"[{step}] MAE_h: {metrics['mae_h']:.4f}m | RMSE_h: {metrics['rmse_h']:.4f}m | "
              f"R²: {metrics['r2_h']:.4f} | IoU: {metrics['iou']:.4f} | Rel Vol Err: {metrics['relative_volume_error']*100:.2f}%")

    if args.out_json:
        Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
        with open(args.out_json, "w") as f:
            json.dump(results, f, indent=2)
        print(f"Saved evaluation results to {args.out_json}")


if __name__ == "__main__":
    main()
