import time
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import torch

from ml.models import get_model


class SurrogateRolloutEngine:
    def __init__(self, checkpoint_path: str, device: str = None):
        if device is None:
            self.device = torch.device(
                "mps" if torch.backends.mps.is_available()
                else "cuda" if torch.cuda.is_available()
                else "cpu"
            )
        else:
            self.device = torch.device(device)

        t0 = time.perf_counter()
        self.checkpoint = torch.load(checkpoint_path, map_location=self.device, weights_only=False)
        self.load_time_ms = (time.perf_counter() - t0) * 1000.0

        model_name = self.checkpoint.get("model_name", "unet_base16")
        base_channels = self.checkpoint.get("base_channels", 16)
        in_c = self.checkpoint.get("input_channels", 7)
        out_c = self.checkpoint.get("output_channels", 3)

        self.model = get_model(model_name, in_channels=in_c, out_channels=out_c, base=base_channels).to(self.device)
        self.model.load_state_dict(self.checkpoint["model_state_dict"])
        self.model.eval()

        self.xm = np.asarray(self.checkpoint["x_mean"], dtype=np.float32)[:, None, None]
        self.xs = np.asarray(self.checkpoint["x_std"], dtype=np.float32)[:, None, None]
        self.ym = np.asarray(self.checkpoint["y_mean"], dtype=np.float32)[:, None, None]
        self.ys = np.asarray(self.checkpoint["y_std"], dtype=np.float32)[:, None, None]

    def rollout(
        self,
        dem: np.ndarray,
        building_mask: np.ndarray,
        roughness: np.ndarray,
        rain_mmhr: float,
        steps: int = 30,
        dx_m: float = 10.0,
        dy_m: float = 10.0,
        h_init: np.ndarray = None,
        u_init: np.ndarray = None,
        v_init: np.ndarray = None,
        h_dry: float = 1e-4,
    ) -> Dict:
        """
        Executes multi-step autoregressive rollout with physical constraints and volume diagnostics.
        """
        dem = np.ascontiguousarray(dem, dtype=np.float32)
        mask = np.ascontiguousarray(building_mask, dtype=np.float32)
        rough = np.ascontiguousarray(roughness, dtype=np.float32)

        if h_init is not None:
            h = np.ascontiguousarray(h_init, dtype=np.float32)
            u = np.ascontiguousarray(u_init, dtype=np.float32) if u_init is not None else np.zeros_like(dem)
            v = np.ascontiguousarray(v_init, dtype=np.float32) if v_init is not None else np.zeros_like(dem)
        else:
            h = np.zeros_like(dem)
            u = np.zeros_like(dem)
            v = np.zeros_like(dem)

        rain = np.full_like(dem, rain_mmhr / 3_600_000.0, dtype=np.float32)
        cell_area = dx_m * dy_m
        fluid_cells = float((mask < 0.5).sum())

        h_frames = [h.copy()]
        u_frames = [u.copy()]
        v_frames = [v.copy()]
        volumes = [float((h * cell_area * (mask < 0.5)).sum())]
        expected_volumes = [volumes[0]]

        step_latencies_ms = []
        static_stack = [dem, mask, rough]

        with torch.no_grad():
            for s in range(1, steps + 1):
                t_step_0 = time.perf_counter()

                x_raw = np.stack(static_stack + [h, u, v, rain], axis=0)
                x_norm = (x_raw - self.xm) / self.xs
                tensor = torch.from_numpy(x_norm[None].copy()).to(self.device)

                pred_norm = self.model(tensor).cpu().numpy()[0]
                pred_phys = pred_norm * self.ys + self.ym

                # Physical depth must be non-negative
                h = np.maximum(pred_phys[0], 0.0).astype(np.float32)
                u = pred_phys[1].astype(np.float32)
                v = pred_phys[2].astype(np.float32)

                # Dry cell handling: velocities in dry cells are strictly zero
                dry_mask = (h <= h_dry)
                u[dry_mask] = 0.0
                v[dry_mask] = 0.0

                # Building boundary condition: zero fluid inside buildings
                bld = (mask > 0.5)
                h[bld] = 0.0
                u[bld] = 0.0
                v[bld] = 0.0

                step_latencies_ms.append((time.perf_counter() - t_step_0) * 1000.0)

                # Track volumes
                vol_actual = float((h * cell_area * (mask < 0.5)).sum())
                # Rain volume added in 60s
                vol_rain_step = float((rain_mmhr / 3_600_000.0) * 60.0 * cell_area * fluid_cells)
                vol_expected = expected_volumes[-1] + vol_rain_step

                volumes.append(vol_actual)
                expected_volumes.append(vol_expected)

                h_frames.append(h.copy())
                u_frames.append(u.copy())
                v_frames.append(v.copy())

        return {
            "h_frames": h_frames,
            "u_frames": u_frames,
            "v_frames": v_frames,
            "volumes": volumes,
            "expected_volumes": expected_volumes,
            "volume_drift_m3": [v_act - v_exp for v_act, v_exp in zip(volumes, expected_volumes)],
            "step_latencies_ms": step_latencies_ms,
            "mean_step_latency_ms": float(np.mean(step_latencies_ms)),
            "total_rollout_time_ms": float(np.sum(step_latencies_ms)),
            "load_time_ms": self.load_time_ms,
        }
