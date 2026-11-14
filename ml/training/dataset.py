import numpy as np
import torch
from torch.utils.data import Dataset


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
    def __init__(self, files, x_mean, x_std, y_mean, y_std):
        self.files = list(files)
        self.x_mean = x_mean[:, None, None]
        self.x_std = x_std[:, None, None]
        self.y_mean = y_mean[:, None, None]
        self.y_std = y_std[:, None, None]

    def __len__(self):
        return len(self.files)

    def __getitem__(self, index):
        with np.load(self.files[index]) as data:
            x = data["x"].astype(np.float32)
            y = data["y"].astype(np.float32)

        x = (x - self.x_mean) / self.x_std
        y = (y - self.y_mean) / self.y_std

        return torch.from_numpy(x.copy()), torch.from_numpy(y.copy())
