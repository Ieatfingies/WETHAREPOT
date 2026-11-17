"""Repeatable fixed-input wall-clock benchmark; does not alter scientific settings."""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile
import threading
import time
from pathlib import Path
import sys

import numpy as np
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from geospatial.grid_generation.builder import build_region_grids


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", default="bellandur")
    parser.add_argument("--grids", default="128,256,384")
    parser.add_argument("--durations", default="5,15,30")
    parser.add_argument("--output", default="docs/benchmark-results-latest.json")
    parser.add_argument("--binary", default=os.getenv("SOLVER_PATH", str(ROOT / "build" / "swe_solver_oneway.exe")))
    parser.add_argument("--frames-output", default=None, help="Optional NPZ archive of raw depth frames for numerical comparisons")
    args = parser.parse_args()
    binary = Path(args.binary)
    if not binary.is_absolute():
        binary = ROOT / binary
    if not binary.is_file():
        raise SystemExit(f"Solver binary not found: {binary}; compile it using the Dockerfile command first.")
    rows = []
    frame_archive = {}
    for grid in map(int, args.grids.split(",")):
        prep_start = time.perf_counter()
        archive = Path(build_region_grids(args.region, grid_size=grid, resolution_m=10.0))
        prep_ms = (time.perf_counter() - prep_start) * 1000
        with np.load(archive) as data:
            arrays = [data[k].astype(np.float32, copy=False) for k in ("dem", "building_mask", "roughness")]
        for duration in map(int, args.durations.split(",")):
            with tempfile.TemporaryDirectory(prefix="wetharepot-bench-") as folder:
                root = Path(folder)
                inp, out = root / "in", root / "out"
                inp.mkdir(); out.mkdir()
                for name, array in zip(("dem.bin", "mask.bin", "rough.bin"), arrays):
                    array.tofile(inp / name)
                command = [str(binary), str(inp), str(out), str(grid), "10", "80", str(duration * 60), "300"]
                env = os.environ.copy(); env["OMP_NUM_THREADS"] = "2"; env["MKL_NUM_THREADS"] = "2"
                peak_rss = [0]; stop = threading.Event()
                try:
                    import psutil
                    ps = psutil
                except ImportError:
                    ps = None
                def monitor(proc: subprocess.Popen) -> None:
                    if ps is None: return
                    tracked = ps.Process(proc.pid)
                    while not stop.is_set():
                        try: peak_rss[0] = max(peak_rss[0], tracked.memory_info().rss)
                        except (ps.NoSuchProcess, ps.AccessDenied): break
                        stop.wait(.05)
                started = time.perf_counter()
                process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
                watcher = threading.Thread(target=monitor, args=(process,), daemon=True); watcher.start()
                stdout, stderr = process.communicate(); elapsed_ms = (time.perf_counter() - started) * 1000
                stop.set(); watcher.join()
                if process.returncode:
                    raise RuntimeError(stderr or stdout)
                step_match = re.search(r"\((\d+) CFL steps\)", stdout)
                output_size = sum(p.stat().st_size for p in out.iterdir())
                frame_paths = sorted(out.glob("*_h.bin"))
                arrays_out = [np.fromfile(path, dtype=np.float32).reshape(grid, grid) for path in frame_paths]
                serialization_start = time.perf_counter()
                frame_summary = [frame.tolist() for frame in arrays_out]
                json.dumps(frame_summary, separators=(",", ":"))
                serialization_ms = (time.perf_counter() - serialization_start) * 1000
                for frame_index, frame in enumerate(arrays_out):
                    frame_archive[f"g{grid}_t{duration}_f{frame_index}"] = frame
                rows.append({"region": args.region, "grid": grid, "resolution_m": 10, "duration_min": duration,
                    "terrain_preparation_ms": round(prep_ms, 2), "solver_wall_ms": round(elapsed_ms, 2),
                    "solver_steps": int(step_match.group(1)) if step_match else None,
                    "mean_ms_per_step": round(elapsed_ms / int(step_match.group(1)), 4) if step_match else None,
                    "output_bytes": output_size, "json_frame_serialization_ms": round(serialization_ms, 2),
                    "peak_rss_bytes": peak_rss[0] or None, "cpu_threads": 2,
                    "stdout": stdout.strip()})
                print(json.dumps(rows[-1]))
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"binary": str(binary), "settings": {"rain_mmhr": 80, "save_interval_s": 300, "omp_threads": 2}, "results": rows}, indent=2), encoding="utf-8")
    if args.frames_output:
        frames_path = ROOT / args.frames_output
        frames_path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(frames_path, **frame_archive)
        print(f"Wrote depth frames {frames_path}")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
