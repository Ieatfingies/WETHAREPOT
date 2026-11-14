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
    evaluate_rainfall_accumulation_baseline,
    evaluate_trajectory_rollout,
)
from ml.inference.predict_experimental import SurrogateRolloutEngine

HORIZONS_STEPS = [1, 2, 5, 10, 15, 20, 25, 30]
HORIZONS_SECONDS = [60, 120, 300, 600, 900, 1200, 1500, 1800]


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
    horizons: List[int] = HORIZONS_STEPS,
    project_mass: bool = False,
    projection_mode: str = "flux",
) -> Dict:
    engine = SurrogateRolloutEngine(checkpoint_path)
    trajectories = load_dataset_trajectories(split_dir)

    all_results = {}
    aggregated_horizons = {f"step_{h}": [] for h in horizons}

    for (reg, rain), frames in trajectories.items():
        traj_res = evaluate_trajectory_rollout(
            engine, frames, horizons=horizons, project_mass=project_mass, projection_mode=projection_mode
        )
        all_results[f"{reg}_{rain:.0f}mmhr"] = traj_res
        for h_key, metrics in traj_res["horizon_metrics"].items():
            if h_key in aggregated_horizons:
                aggregated_horizons[h_key].append(metrics)

    summary_horizons = {}
    for h_key, metric_list in aggregated_horizons.items():
        if not metric_list:
            continue
        summary_horizons[h_key] = {
            "mae_h": float(np.mean([m["mae_h"] for m in metric_list])),
            "rmse_h": float(np.mean([m["rmse_h"] for m in metric_list])),
            "mae_h_full": float(np.mean([m.get("mae_h_full", m["mae_h"]) for m in metric_list])),
            "rmse_h_full": float(np.mean([m.get("rmse_h_full", m["rmse_h"]) for m in metric_list])),
            "mae_h_wet": float(np.mean([m.get("mae_h_wet", 0.0) for m in metric_list])),
            "rmse_h_wet": float(np.mean([m.get("rmse_h_wet", 0.0) for m in metric_list])),
            "signed_depth_error": float(np.mean([m.get("signed_depth_error", 0.0) for m in metric_list])),
            "r2_h": float(np.mean([m["r2_h"] for m in metric_list])),
            "mae_u": float(np.mean([m["mae_u"] for m in metric_list])),
            "mae_v": float(np.mean([m["mae_v"] for m in metric_list])),
            "rmse_speed": float(np.mean([m["rmse_speed"] for m in metric_list])),
            "iou": float(np.mean([m["iou"] for m in metric_list])),
            "precision": float(np.mean([m["precision"] for m in metric_list])),
            "recall": float(np.mean([m["recall"] for m in metric_list])),
            "f1": float(np.mean([m.get("f1", 0.0) for m in metric_list])),
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
    horizons: List[int] = HORIZONS_STEPS,
) -> Dict:
    trajectories = load_dataset_trajectories(split_dir)
    aggregated_horizons = {f"step_{h}": [] for h in horizons}

    for (reg, rain), frames in trajectories.items():
        traj_res = evaluate_persistence_baseline(frames, horizons=horizons)
        for h_key, metrics in traj_res.items():
            if h_key in aggregated_horizons:
                aggregated_horizons[h_key].append(metrics)

    summary_horizons = {}
    for h_key, metric_list in aggregated_horizons.items():
        if not metric_list:
            continue
        summary_horizons[h_key] = {
            "mae_h": float(np.mean([m["mae_h"] for m in metric_list])),
            "rmse_h": float(np.mean([m["rmse_h"] for m in metric_list])),
            "mae_h_full": float(np.mean([m.get("mae_h_full", m["mae_h"]) for m in metric_list])),
            "rmse_h_full": float(np.mean([m.get("rmse_h_full", m["rmse_h"]) for m in metric_list])),
            "mae_h_wet": float(np.mean([m.get("mae_h_wet", 0.0) for m in metric_list])),
            "rmse_h_wet": float(np.mean([m.get("rmse_h_wet", 0.0) for m in metric_list])),
            "signed_depth_error": float(np.mean([m.get("signed_depth_error", 0.0) for m in metric_list])),
            "r2_h": float(np.mean([m["r2_h"] for m in metric_list])),
            "mae_u": float(np.mean([m["mae_u"] for m in metric_list])),
            "mae_v": float(np.mean([m["mae_v"] for m in metric_list])),
            "rmse_speed": float(np.mean([m["rmse_speed"] for m in metric_list])),
            "iou": float(np.mean([m["iou"] for m in metric_list])),
            "precision": float(np.mean([m["precision"] for m in metric_list])),
            "recall": float(np.mean([m["recall"] for m in metric_list])),
            "f1": float(np.mean([m.get("f1", 0.0) for m in metric_list])),
            "relative_volume_error": float(np.mean([m["relative_volume_error"] for m in metric_list])),
            "building_violations": float(np.sum([m["building_violations"] for m in metric_list])),
            "negative_depth_count": float(np.sum([m["negative_depth_count"] for m in metric_list])),
        }

    return {"summary_horizons": summary_horizons}


def evaluate_rainfall_accumulation_on_split(
    split_dir: str,
    horizons: List[int] = HORIZONS_STEPS,
) -> Dict:
    trajectories = load_dataset_trajectories(split_dir)
    aggregated_horizons = {f"step_{h}": [] for h in horizons}

    for (reg, rain), frames in trajectories.items():
        traj_res = evaluate_rainfall_accumulation_baseline(frames, horizons=horizons)
        for h_key, metrics in traj_res.items():
            if h_key in aggregated_horizons:
                aggregated_horizons[h_key].append(metrics)

    summary_horizons = {}
    for h_key, metric_list in aggregated_horizons.items():
        if not metric_list:
            continue
        summary_horizons[h_key] = {
            "mae_h": float(np.mean([m["mae_h"] for m in metric_list])),
            "rmse_h": float(np.mean([m["rmse_h"] for m in metric_list])),
            "mae_h_full": float(np.mean([m.get("mae_h_full", m["mae_h"]) for m in metric_list])),
            "rmse_h_full": float(np.mean([m.get("rmse_h_full", m["rmse_h"]) for m in metric_list])),
            "mae_h_wet": float(np.mean([m.get("mae_h_wet", 0.0) for m in metric_list])),
            "rmse_h_wet": float(np.mean([m.get("rmse_h_wet", 0.0) for m in metric_list])),
            "signed_depth_error": float(np.mean([m.get("signed_depth_error", 0.0) for m in metric_list])),
            "r2_h": float(np.mean([m["r2_h"] for m in metric_list])),
            "mae_u": float(np.mean([m["mae_u"] for m in metric_list])),
            "mae_v": float(np.mean([m["mae_v"] for m in metric_list])),
            "rmse_speed": float(np.mean([m["rmse_speed"] for m in metric_list])),
            "iou": float(np.mean([m["iou"] for m in metric_list])),
            "precision": float(np.mean([m["precision"] for m in metric_list])),
            "recall": float(np.mean([m["recall"] for m in metric_list])),
            "f1": float(np.mean([m.get("f1", 0.0) for m in metric_list])),
            "relative_volume_error": float(np.mean([m["relative_volume_error"] for m in metric_list])),
            "building_violations": float(np.sum([m["building_violations"] for m in metric_list])),
            "negative_depth_count": float(np.sum([m["negative_depth_count"] for m in metric_list])),
        }

    return {"summary_horizons": summary_horizons}
