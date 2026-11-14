import os
import shutil
from pathlib import Path
import numpy as np

SOURCE_DIR = Path("data/processed/dataset")
TARGET_DIR = Path("data/processed/dataset_experimental")

# Deliberate validation trajectories
VAL_TRAJECTORIES = {
    ("whitefield", 130.0),
    ("hsr_layout", 60.0),
}

TEST_REGIONS = {"koramangala"}


def build_split():
    if TARGET_DIR.exists():
        shutil.rmtree(TARGET_DIR)

    (TARGET_DIR / "train").mkdir(parents=True, exist_ok=True)
    (TARGET_DIR / "val").mkdir(parents=True, exist_ok=True)
    (TARGET_DIR / "test").mkdir(parents=True, exist_ok=True)

    all_files = sorted(SOURCE_DIR.glob("**/*.npz"))
    print(f"Found {len(all_files)} total raw frames in source dataset.")

    counts = {"train": 0, "val": 0, "test": 0}
    trajs = {"train": set(), "val": set(), "test": set()}

    for f in all_files:
        with np.load(f) as d:
            reg = str(d["region"])
            rain = float(d["rain_mmhr"])
            x = d["x"]
            y = d["y"]

        key = (reg, rain)
        if reg in TEST_REGIONS:
            split = "test"
        elif key in VAL_TRAJECTORIES:
            split = "val"
        else:
            split = "train"

        out_name = f"sample_{counts[split]:05d}.npz"
        out_path = TARGET_DIR / split / out_name
        np.savez_compressed(
            out_path,
            x=x,
            y=y,
            region=reg,
            rain_mmhr=rain,
        )
        counts[split] += 1
        trajs[split].add(key)

    print("\n--- EXPERIMENTAL DATASET SPLIT ---")
    for s in ["train", "val", "test"]:
        print(f"{s.upper()}: {counts[s]} frames across {len(trajs[s])} trajectories:")
        for t in sorted(trajs[s]):
            print(f"   - {t[0]} @ {t[1]} mm/hr")

    assert counts["train"] == 420, f"Expected 420 train frames, got {counts['train']}"
    assert counts["val"] == 60, f"Expected 60 val frames, got {counts['val']}"
    assert counts["test"] == 120, f"Expected 120 test frames, got {counts['test']}"
    print("\nSUCCESS: Split perfectly matches target 14/2/4 trajectories (420/60/120 frames).")


if __name__ == "__main__":
    build_split()
