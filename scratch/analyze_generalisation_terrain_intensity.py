import numpy as np
from ml.inference.predict_experimental import SurrogateRolloutEngine
from ml.evaluation.evaluator import compute_metrics_2d
from ml.evaluation.run_evaluation import load_dataset_trajectories, HORIZONS_STEPS, HORIZONS_SECONDS

print("=== PRIORITY 3: GENERALISATION AUDIT (KORAMANGALA VS UNTOUCHED VARTHUR) ===")

engine = SurrogateRolloutEngine("ml/weights/exp_clean_multiscale_pinn_v2.pth")

kora_trajs = load_dataset_trajectories("data/processed/dataset_clean/test")
varthur_trajs = load_dataset_trajectories("data/processed/dataset_clean/test_untouched_varthur")

def audit_catchment_terrain(name: str, path: str):
    geo = np.load(path)
    dem = geo["dem"]
    mask = geo["building_mask"]
    rough = geo["roughness"]
    
    fluid = (mask < 0.5)
    elev = dem[fluid]
    
    # Calculate gradient (slope)
    dy, dx = np.gradient(dem, 10.0, 10.0)
    slope = np.sqrt(dx**2 + dy**2)
    slope_fluid = slope[fluid]
    
    print(f"\nTerrain Characteristics: {name.upper()}")
    print(f"  Elevation:     min = {elev.min():.1f}m, max = {elev.max():.1f}m, relief = {elev.max()-elev.min():.1f}m")
    print(f"  Mean Slope:    {slope_fluid.mean()*100:.2f}% (max = {slope_fluid.max()*100:.2f}%)")
    print(f"  Building Mask: {(mask > 0.5).mean()*100:.1f}% impervious building footprint")
    print(f"  Manning n:     mean = {rough[fluid].mean():.4f}")

audit_catchment_terrain("Koramangala (Held-Out Test)", "data/processed/koramangala_256.npz")
audit_catchment_terrain("Varthur (Untouched Pristine Test)", "data/processed/varthur_256.npz")

print("\n" + "=" * 95)
print("INTENSITY SENSITIVITY BREAKDOWN @ 1800s (30, 60, 95, 130 mm/hr)")
print("=" * 95)
header = f"{'Region':14s} | {'Rain':8s} | {'MAE_all':8s} | {'MAE_wet':8s} | {'RMSE_all':8s} | {'RMSE_wet':8s} | {'Signed':8s} | {'IoU':6s} | {'F1':6s} | {'Vol Err %':9s}"
print(header)
print("-" * len(header))

for name, trajs in [("Koramangala", kora_trajs), ("Varthur", varthur_trajs)]:
    for (reg, rain), frames in sorted(trajs.items()):
        last_frame = frames[-1]
        dem = last_frame["x"][0]
        mask = last_frame["x"][1]
        rough = last_frame["x"][2]
        gt_h = last_frame["y"][0]
        gt_u = last_frame["y"][1]
        gt_v = last_frame["y"][2]
        
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
        pred_u = rollout_res["u_frames"][-1]
        pred_v = rollout_res["v_frames"][-1]
        
        m = compute_metrics_2d(pred_h, gt_h, pred_u, gt_u, pred_v, gt_v, mask)
        print(
            f"{name:14s} | {rain:5.0f}mm | {m['mae_h']:8.4f} | {m['mae_h_wet']:8.4f} | "
            f"{m['rmse_h']:8.4f} | {m['rmse_h_wet']:8.4f} | {m['signed_depth_error']:+8.4f} | "
            f"{m['iou']:6.4f} | {m['f1']:6.4f} | {m['relative_volume_error']*100:8.2f}%"
        )
    print("-" * len(header))
