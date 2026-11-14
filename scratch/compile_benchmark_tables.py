import json

with open("ml/evaluation/final_optimised_benchmark_report.json") as f:
    data = json.load(f)

def print_table(split_name, split_data):
    print(f"\n{'='*110}")
    print(f"BENCHMARK REPORT: {split_name.upper()}")
    print(f"{'='*110}")
    header = f"{'Model':44s} | {'Horizon':7s} | {'MAE_all':8s} | {'MAE_wet':8s} | {'RMSE_all':8s} | {'Signed':8s} | {'IoU':6s} | {'Recall':6s} | {'Vol Err %':9s}"
    print(header)
    print("-" * len(header))

    for model_name, model_res in split_data.items():
        summary = model_res["summary_horizons"]
        for s_idx, sec in [(1, 60), (2, 120), (5, 300), (10, 600), (15, 900), (20, 1200), (25, 1500), (30, 1800)]:
            h_key = f"step_{s_idx}"
            if h_key in summary:
                m = summary[h_key]
                mae_all = m.get("mae_h_full", m.get("mae_h", 0.0))
                mae_wet = m.get("mae_h_wet", 0.0)
                rmse_all = m.get("rmse_h_full", m.get("rmse_h", 0.0))
                signed_err = m.get("signed_depth_error", 0.0)
                iou = m.get("iou", 0.0)
                rec = m.get("recall", 0.0)
                vol_err = m.get("relative_volume_error", 0.0) * 100.0
                print(
                    f"{model_name:44s} | {sec:5d}s | {mae_all:8.4f} | {mae_wet:8.4f} | "
                    f"{rmse_all:8.4f} | {signed_err:+8.4f} | {iou:6.4f} | {rec:6.4f} | {vol_err:8.2f}%"
                )
        print("-" * len(header))

print_table("Validation Set (HSR Layout & Whitefield)", data["validation_evaluation"])
print_table("Held-Out Test Set (Koramangala 30, 60, 95, 130 mm/hr)", data["test_evaluation"])
print_table("Untouched Pristine Test Set (Varthur 30, 60, 95, 130 mm/hr)", data["untouched_test_evaluation"])

print("\nSOLVER BENCHMARK:")
sb = data["solver_benchmark"]
print(f"  Solver Runtime:    {sb['solver_elapsed_ms']:.2f} ms")
print(f"  Surrogate Runtime: {sb['surrogate_elapsed_ms']:.2f} ms (mean step: {sb['surrogate_mean_step_ms']:.2f} ms)")
print(f"  Speedup Factor:    {sb['speedup_factor']:.1f}x")
print(f"  Physical violations: Neg depths = {sb['surrogate_negative_depth_count']}, Buildings = {sb['surrogate_building_violations']}")
