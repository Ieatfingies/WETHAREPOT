import numpy as np
import torch
from torch.utils.data import Dataset
from pathlib import Path
from typing import List, Tuple, Dict, Union


def compute_statistics(files):
    sx = np.zeros(7, dtype=np.float64)
    qx = np.zeros(7, dtype=np.float64)
    sy = np.zeros(3, dtype=np.float64)
    qy = np.zeros(3, dtype=np.float64)
    count = 0

    for path in files:
        with np.load(path) as data:
            x = data["x"].astype(np.float64)
            y = data["y"].astype(np.float64)
            sx += x.sum(axis=(1, 2))
            qx += np.square(x).sum(axis=(1, 2))
            sy += y.sum(axis=(1, 2))
            qy += np.square(y).sum(axis=(1, 2))
            count += x.shape[1] * x.shape[2]

    xm = sx / count
    ym = sy / count
    xs = np.sqrt(np.maximum(qx / count - xm**2, 1e-12))
    ys = np.sqrt(np.maximum(qy / count - ym**2, 1e-12))

    return (
        xm.astype(np.float32),
        xs.astype(np.float32),
        ym.astype(np.float32),
        ys.astype(np.float32),
    )


class FloodDataset(Dataset):
    def __init__(self, files, x_mean, x_std, y_mean, y_std, return_raw: bool = False):
        self.files = list(files)
        self.x_mean = x_mean[:, None, None]
        self.x_std = x_std[:, None, None]
        self.y_mean = y_mean[:, None, None]
        self.y_std = y_std[:, None, None]
        self.return_raw = return_raw

    def __len__(self):
        return len(self.files)

    def __getitem__(self, index):
        with np.load(self.files[index]) as data:
            x_raw = data["x"].astype(np.float32)
            y_raw = data["y"].astype(np.float32)

        x_norm = (x_raw - self.x_mean) / self.x_std
        y_norm = (y_raw - self.y_mean) / self.y_std

        if self.return_raw:
            return (
                torch.from_numpy(x_norm.copy()),
                torch.from_numpy(y_norm.copy()),
                torch.from_numpy(x_raw.copy()),
            )
        return torch.from_numpy(x_norm.copy()), torch.from_numpy(y_norm.copy())


class PairedFloodDataset(Dataset):
    """
    Dataset that pairs consecutive frames (t, t+1) within each simulation trajectory
    to enable 2-step rollout training and scheduled sampling.
    """
    def __init__(self, split_dir: Union[str, List[str]], x_mean, x_std, y_mean, y_std):
        self.x_mean = x_mean[:, None, None]
        self.x_std = x_std[:, None, None]
        self.y_mean = y_mean[:, None, None]
        self.y_std = y_std[:, None, None]

        # Support single directory or list of directories
        dirs = [split_dir] if isinstance(split_dir, (str, Path)) else split_dir
        files = []
        for d in dirs:
            files.extend(sorted(Path(d).glob("*.npz")))

        trajs: Dict[Tuple[str, float, str], List[Path]] = {}
        for f in files:
            with np.load(f) as d:
                reg = str(d["region"])
                rain = float(d["rain_mmhr"])
                scen = str(d["scenario_name"]) if "scenario_name" in d else "uniform"
            key = (reg, rain, scen)
            if key not in trajs:
                trajs[key] = []
            trajs[key].append(f)

        self.pairs = []
        for key, traj_files in trajs.items():
            # For each step t from 0 to N-2, pair frame t and frame t+1
            for i in range(len(traj_files) - 1):
                self.pairs.append((traj_files[i], traj_files[i + 1]))

    def __len__(self):
        return len(self.pairs)

    def __getitem__(self, index):
        f1, f2 = self.pairs[index]
        with np.load(f1) as d1:
            x1_raw = d1["x"].astype(np.float32)
            y1_raw = d1["y"].astype(np.float32)
        with np.load(f2) as d2:
            x2_raw = d2["x"].astype(np.float32)
            y2_raw = d2["y"].astype(np.float32)

        x1_norm = (x1_raw - self.x_mean) / self.x_std
        y1_norm = (y1_raw - self.y_mean) / self.y_std
        y2_norm = (y2_raw - self.y_mean) / self.y_std

        return (
            torch.from_numpy(x1_norm.copy()),
            torch.from_numpy(y1_norm.copy()),
            torch.from_numpy(x1_raw.copy()),
            torch.from_numpy(y2_norm.copy()),
            torch.from_numpy(x2_raw.copy()),
        )


class TripletFloodDataset(Dataset):
    """
    Dataset that pairs three consecutive frames (t, t+1, t+2) within each simulation trajectory
    to enable up to 3-step progressive rollout training and multi-step stability.
    """
    def __init__(self, split_dir: Union[str, List[str]], x_mean, x_std, y_mean, y_std):
        self.x_mean = x_mean[:, None, None]
        self.x_std = x_std[:, None, None]
        self.y_mean = y_mean[:, None, None]
        self.y_std = y_std[:, None, None]

        dirs = [split_dir] if isinstance(split_dir, (str, Path)) else split_dir
        files = []
        for d in dirs:
            files.extend(sorted(Path(d).glob("*.npz")))

        trajs: Dict[Tuple[str, float, str], List[Path]] = {}
        for f in files:
            with np.load(f) as d:
                reg = str(d["region"])
                rain = float(d["rain_mmhr"])
                scen = str(d["scenario_name"]) if "scenario_name" in d else "uniform"
            key = (reg, rain, scen)
            if key not in trajs:
                trajs[key] = []
            trajs[key].append(f)

        self.triplets = []
        for key, traj_files in trajs.items():
            for i in range(len(traj_files) - 2):
                self.triplets.append((traj_files[i], traj_files[i + 1], traj_files[i + 2]))

    def __len__(self):
        return len(self.triplets)

    def __getitem__(self, index):
        f1, f2, f3 = self.triplets[index]
        with np.load(f1) as d1:
            x1_raw = d1["x"].astype(np.float32)
            y1_raw = d1["y"].astype(np.float32)
        with np.load(f2) as d2:
            x2_raw = d2["x"].astype(np.float32)
            y2_raw = d2["y"].astype(np.float32)
        with np.load(f3) as d3:
            x3_raw = d3["x"].astype(np.float32)
            y3_raw = d3["y"].astype(np.float32)

        x1_norm = (x1_raw - self.x_mean) / self.x_std
        y1_norm = (y1_raw - self.y_mean) / self.y_std
        y2_norm = (y2_raw - self.y_mean) / self.y_std
        y3_norm = (y3_raw - self.y_mean) / self.y_std

        return (
            torch.from_numpy(x1_norm.copy()),
            torch.from_numpy(y1_norm.copy()),
            torch.from_numpy(x1_raw.copy()),
            torch.from_numpy(y2_norm.copy()),
            torch.from_numpy(x2_raw.copy()),
            torch.from_numpy(y3_norm.copy()),
            torch.from_numpy(x3_raw.copy()),
        )
