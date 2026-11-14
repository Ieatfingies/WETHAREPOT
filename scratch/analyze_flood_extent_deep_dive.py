import numpy as np
import torch
from ml.inference.predict_experimental import SurrogateRolloutEngine
from ml.evaluation.run_evaluation import load_dataset_trajectories

print("=== PRIORITY 2: FLOOD EXTENT DEEP DIVE (VALIDATION SET ONLY) ===")

val_dir = "data/processed/dataset_clean/val"
val_trajs = load_dataset_trajectories(val_dir)
print(f"Loaded validation trajectories: {list(val_trajs.keys())}")

engine = SurrogateRolloutEngine("ml/weights/exp_clean_multiscale_pinn_v2.pth")

thresholds = [0.01, 0.02, 0.03, 0.05, 0.08, 0.10, 0.15, 0.20]

for (reg, rain), frames in val_trajs.items():
    print(f"\n=======================================================")
    print(f"ANALYSIS FOR VALIDATION REGION: {reg} @ {rain:.0f} mm/hr (1800s Rollout)")
    print(f"=======================================================")
    
    f0 = frames[0]
    dem = f0["x"][0]
    mask = f0["x"][1]
    rough = f0["x"][2]
    fluid_mask = (mask < 0.5)
    
    last_frame = frames[-1]
    gt_h = last_frame["y"][0]
    
    # Run 30-step rollout with V2
    rollout_res = engine.rollout(
        dem=dem,
        building_mask=mask,
        roughness=rough,
        rain_mmhr=float(rain),
        steps=30,
        project_mass=True,
        projection_mode="flux",
    )
    pred_h = rollout_res["h_frames"][-1]
    
    ph_fluid = pred_h[fluid_mask]
    th_fluid = gt_h[fluid_mask]
    
    print(f"Domain Fluid Stats: N = {len(ph_fluid)} cells")
    print(f"  GT Depth:   min = {th_fluid.min():.4f}m, mean = {th_fluid.mean():.4f}m, max = {th_fluid.max():.4f}m, p90 = {np.percentile(th_fluid, 90):.4f}m, p95 = {np.percentile(th_fluid, 95):.4f}m")
    print(f"  Pred Depth: min = {ph_fluid.min():.4f}m, mean = {ph_fluid.mean():.4f}m, max = {ph_fluid.max():.4f}m, p90 = {np.percentile(ph_fluid, 90):.4f}m, p95 = {np.percentile(ph_fluid, 95):.4f}m")
    
    print(f"\nMulti-Threshold Extent Evaluation:")
    print(f"{'Threshold':10s} | {'GT Wet':8s} | {'Pred Wet':8s} | {'TP':8s} | {'FP':8s} | {'FN':8s} | {'Precision':10s} | {'Recall':8s} | {'IoU':8s} | {'F1':8s}")
    print("-" * 95)
    
    for th in thresholds:
        gt_wet = (th_fluid >= th)
        pr_wet = (ph_fluid >= th)
        
        tp = int((gt_wet & pr_wet).sum())
        fp = int((pr_wet & (~gt_wet)).sum())
        fn = int(((~pr_wet) & gt_wet).sum())
        
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        iou = tp / (tp + fp + fn) if (tp + fp + fn) > 0 else 0.0
        f1 = 2 * prec * rec / (prec + rec + 1e-8) if (prec + rec) > 0 else 0.0
        
        print(f"{th*100:6.1f} cm  | {gt_wet.sum():8d} | {pr_wet.sum():8d} | {tp:8d} | {fp:8d} | {fn:8d} | {prec:10.4f} | {rec:8.4f} | {iou:8.4f} | {f1:8.4f}")

    # Inspect depth error near the 5cm threshold (cells where gt_h is between 3cm and 7cm)
    near_5cm = (th_fluid >= 0.03) & (th_fluid <= 0.07)
    if near_5cm.any():
        err_near = ph_fluid[near_5cm] - th_fluid[near_5cm]
        print(f"\nBoundary Margin Analysis (Cells with GT depth between 3 cm and 7 cm, N={near_5cm.sum()}):")
        print(f"  Mean Signed Error: {err_near.mean()*100:+.2f} cm")
        print(f"  MAE:               {np.abs(err_near).mean()*100:.2f} cm")
        print(f"  Predicted < 5cm when GT >= 5cm (False Negatives near boundary): {((th_fluid[near_5cm] >= 0.05) & (ph_fluid[near_5cm] < 0.05)).sum()} / {(th_fluid[near_5cm] >= 0.05).sum()}")
        print(f"  Predicted >= 5cm when GT < 5cm (False Positives near boundary): {((th_fluid[near_5cm] < 0.05) & (ph_fluid[near_5cm] >= 0.05)).sum()} / {(th_fluid[near_5cm] < 0.05).sum()}")
