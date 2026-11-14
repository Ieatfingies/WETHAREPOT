import os
from pathlib import Path
from typing import Dict, List, Tuple
import numpy as np
import torch

from ml.inference.predict_experimental import SurrogateRolloutEngine


def compute_metrics_2d(
    pred_h: np.ndarray,
    true_h: np.ndarray,
    pred_u: np.ndarray,
    true_u: np.ndarray,
    pred_v: np.ndarray,
    true_v: np.ndarray,
    mask: np.ndarray,
    flood_threshold: float = 0.05,
    dx_m: float = 10.0,
    dy_m: float = 10.0,
) -> Dict[str, float]:
    """
    Computes rigorous physical, statistical, and flood extent metrics.
    Only evaluates over fluid cells (mask < 0.5).
    """
    fluid = (mask < 0.5)
    cell_area = dx_m * dy_m

    ph = pred_h[fluid]
    th = true_h[fluid]
    pu = pred_u[fluid]
    tu = true_u[fluid]
    pv = pred_v[fluid]
    tv = true_v[fluid]

    # Depth errors (full domain)
    dh = ph - th
    mae_h = float(np.mean(np.abs(dh)))
    rmse_h = float(np.sqrt(np.mean(dh ** 2)))
    signed_error_h = float(np.mean(dh))

    # Wet-cell only depth errors (cells where gt >= threshold or pred >= threshold)
    wet_mask = (th >= flood_threshold) | (ph >= flood_threshold)
    if np.any(wet_mask):
        mae_h_wet = float(np.mean(np.abs(dh[wet_mask])))
        rmse_h_wet = float(np.sqrt(np.mean(dh[wet_mask] ** 2)))
    else:
        mae_h_wet = 0.0
        rmse_h_wet = 0.0

    # R2 for depth
    ss_tot = float(np.sum((th - np.mean(th)) ** 2))
    ss_res = float(np.sum(dh ** 2))
    r2_h = float(1.0 - (ss_res / (ss_tot + 1e-8))) if ss_tot > 1e-6 else 1.0

    # Velocity errors
    mae_u = float(np.mean(np.abs(pu - tu)))
    mae_v = float(np.mean(np.abs(pv - tv)))
    speed_p = np.sqrt(pu ** 2 + pv ** 2)
    speed_t = np.sqrt(tu ** 2 + tv ** 2)
    rmse_speed = float(np.sqrt(np.mean((speed_p - speed_t) ** 2)))

    # Flood Extent (IoU, Precision, Recall, F1 at flood_threshold)
    pred_wet = (ph >= flood_threshold)
    true_wet = (th >= flood_threshold)

    tp = float(np.sum(pred_wet & true_wet))
    fp = float(np.sum(pred_wet & (~true_wet)))
    fn = float(np.sum((~pred_wet) & true_wet))

    denom_iou = tp + fp + fn
    iou = float(tp / denom_iou) if denom_iou > 0 else 0.0
    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    f1 = float(2.0 * precision * recall / (precision + recall + 1e-8)) if (precision + recall) > 0 else 0.0

    # Volume error
    v_pred = float(np.sum(ph) * cell_area)
    v_true = float(np.sum(th) * cell_area)
    v_err = abs(v_pred - v_true)
    rel_v_err = float(v_err / max(v_true, 1.0))

    # Boundary and building violations
    building = (mask > 0.5)
    bld_h_violation = float(np.sum(pred_h[building] > 1e-4))
    neg_h_count = float(np.sum(pred_h < -1e-6))
    max_neg_h = float(np.max(-np.minimum(pred_h, 0.0)))

    return {
        "mae_h": mae_h,
        "rmse_h": rmse_h,
        "mae_h_full": mae_h,
        "rmse_h_full": rmse_h,
        "mae_h_wet": mae_h_wet,
        "rmse_h_wet": rmse_h_wet,
        "signed_depth_error": signed_error_h,
        "r2_h": r2_h,
        "mae_u": mae_u,
        "mae_v": mae_v,
        "rmse_speed": rmse_speed,
        "iou": iou,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "v_pred_m3": v_pred,
        "v_true_m3": v_true,
        "volume_error_m3": v_err,
        "relative_volume_error": rel_v_err,
        "building_violations": bld_h_violation,
        "negative_depth_count": neg_h_count,
        "max_negative_depth_m": max_neg_h,
    }


def evaluate_trajectory_rollout(
    engine: SurrogateRolloutEngine,
    frames: List[Dict],
    horizons: List[int] = [1, 2, 5, 10, 15, 20, 25, 30],
    project_mass: bool = False,
    projection_mode: str = "flux",
) -> Dict:
    """
    Evaluates multi-step autoregressive rollout against ground truth simulation trajectory.
    """
    f0 = frames[0]
    dem = f0["x"][0]
    mask = f0["x"][1]
    rough = f0["x"][2]
    rain = float(f0["rain_mmhr"])
    region = str(f0["region"])

    # Extract 2D rainfall sequence across all frames (supports both spatial and uniform)
    rain_seq = [fr["x"][6] for fr in frames]

    # Initial state
    h_init = f0["x"][3]
    u_init = f0["x"][4]
    v_init = f0["x"][5]

    total_steps = len(frames)
    rollout_res = engine.rollout(
        dem=dem,
        building_mask=mask,
        roughness=rough,
        rain_mmhr=rain_seq,
        steps=total_steps,
        h_init=h_init,
        u_init=u_init,
        v_init=v_init,
        project_mass=project_mass,
        projection_mode=projection_mode,
    )

    h_preds = rollout_res["h_frames"]
    u_preds = rollout_res["u_frames"]
    v_preds = rollout_res["v_frames"]

    horizon_metrics = {}
    for h_step in horizons:
        if h_step > total_steps:
            continue
        gt_frame = frames[h_step - 1]
        gt_h = gt_frame["y"][0]
        gt_u = gt_frame["y"][1]
        gt_v = gt_frame["y"][2]

        pred_h = h_preds[h_step]
        pred_u = u_preds[h_step]
        pred_v = v_preds[h_step]

        m = compute_metrics_2d(
            pred_h=pred_h, true_h=gt_h,
            pred_u=pred_u, true_u=gt_u,
            pred_v=pred_v, true_v=gt_v,
            mask=mask,
        )
        horizon_metrics[f"step_{h_step}"] = m

    return {
        "region": region,
        "rain_mmhr": rain,
        "horizon_metrics": horizon_metrics,
        "total_rollout_time_ms": rollout_res["total_rollout_time_ms"],
        "mean_step_latency_ms": rollout_res["mean_step_latency_ms"],
    }


def evaluate_persistence_baseline(
    frames: List[Dict],
    horizons: List[int] = [1, 2, 5, 10, 15, 20, 25, 30],
) -> Dict:
    """
    Zero-change persistence baseline: assumes state never changes from initial condition.
    """
    f0 = frames[0]
    mask = f0["x"][1]
    h_persist = f0["x"][3]
    u_persist = f0["x"][4]
    v_persist = f0["x"][5]

    horizon_metrics = {}
    total_steps = len(frames)

    for h_step in horizons:
        if h_step > total_steps:
            continue
        gt_frame = frames[h_step - 1]
        gt_h = gt_frame["y"][0]
        gt_u = gt_frame["y"][1]
        gt_v = gt_frame["y"][2]

        m = compute_metrics_2d(
            pred_h=h_persist, true_h=gt_h,
            pred_u=u_persist, true_u=gt_u,
            pred_v=v_persist, true_v=gt_v,
            mask=mask,
        )
        horizon_metrics[f"step_{h_step}"] = m

    return horizon_metrics


def evaluate_rainfall_accumulation_baseline(
    frames: List[Dict],
    horizons: List[int] = [1, 2, 5, 10, 15, 20, 25, 30],
    dt_frame_s: float = 60.0,
) -> Dict:
    """
    Hydrological rainfall-accumulation baseline:
    Accumulates uniform or spatial rainfall on fluid cells without overland routing.
    h_pred(t) = h(0) + max(0, R - infiltration) * t
    Building cells remain dry (h = 0).
    Velocities remain zero (u = 0, v = 0).
    """
    f0 = frames[0]
    mask = f0["x"][1]
    h_init = f0["x"][3]
    rain_mmhr = float(f0.get("rain_mmhr", 0.0))
    rain_rate_ms = rain_mmhr / 3600000.0  # m/s

    # Zero velocities
    u_pred = np.zeros_like(h_init)
    v_pred = np.zeros_like(h_init)

    horizon_metrics = {}
    total_steps = len(frames)

    for h_step in horizons:
        if h_step > total_steps:
            continue
        gt_frame = frames[h_step - 1]
        gt_h = gt_frame["y"][0]
        gt_u = gt_frame["y"][1]
        gt_v = gt_frame["y"][2]

        elapsed_time_s = h_step * dt_frame_s
        # Accumulate actual rainfall depth up to horizon step
        accum_rain_m = np.sum([fr["x"][6] * dt_frame_s for fr in frames[:h_step]], axis=0)
        h_accum = np.maximum(0.0, h_init + accum_rain_m)
        h_accum = np.where(mask > 0.5, 0.0, h_accum)

        m = compute_metrics_2d(
            pred_h=h_accum, true_h=gt_h,
            pred_u=u_pred, true_u=gt_u,
            pred_v=v_pred, true_v=gt_v,
            mask=mask,
        )
        horizon_metrics[f"step_{h_step}"] = m

    return horizon_metrics
