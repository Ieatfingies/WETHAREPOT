"""Compare saved SWE depth frames for identical fixed-input benchmark cases."""
import argparse
import json
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("baseline")
parser.add_argument("candidate")
parser.add_argument("--output", default="docs/solver-numerical-comparison.json")
args = parser.parse_args()
with np.load(args.baseline) as baseline, np.load(args.candidate) as candidate:
    shared = sorted(set(baseline.files) & set(candidate.files))
    if not shared:
        raise SystemExit("No matching grid/duration/frame keys found")
    rows = []
    for key in shared:
        a = baseline[key]
        b = candidate[key]
        delta = np.abs(a - b)
        extent_a = a >= 0.05
        extent_b = b >= 0.05
        union = np.logical_or(extent_a, extent_b).sum()
        rows.append({"frame": key, "max_abs_depth_difference_m": float(delta.max()),
            "mean_abs_error_m": float(delta.mean()),
            "flood_extent_iou_at_0_05m": float(np.logical_and(extent_a, extent_b).sum() / union) if union else 1.0,
            "baseline_depth_volume_m3": float(a.sum(dtype=np.float64) * 100),
            "candidate_depth_volume_m3": float(b.sum(dtype=np.float64) * 100)})
report = {"baseline_frames": str(Path(args.baseline)), "candidate_frames": str(Path(args.candidate)), "frame_count": len(rows), "results": rows,
    "max_depth_error_m": max(x["max_abs_depth_difference_m"] for x in rows),
    "mean_absolute_error_m": float(np.mean([x["mean_abs_error_m"] for x in rows])),
    "mean_extent_iou": float(np.mean([x["flood_extent_iou_at_0_05m"] for x in rows]))}
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({k: report[k] for k in ("frame_count", "max_depth_error_m", "mean_absolute_error_m", "mean_extent_iou")}))
