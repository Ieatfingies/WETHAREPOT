import time
from pathlib import Path
from typing import Dict, List, Tuple, Union

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
        rain_mmhr: Union[float, np.ndarray, List[np.ndarray]],
        steps: int = 30,
        dx_m: float = 10.0,
        dy_m: float = 10.0,
        h_init: np.ndarray = None,
        u_init: np.ndarray = None,
        v_init: np.ndarray = None,
        h_dry: float = 1e-4,
        project_mass: bool = False,
        projection_mode: str = "flux",
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

        cell_area = dx_m * dy_m
        fluid_mask = (mask < 0.5)

        # Support float (uniform), 2D array (spatial static), or list of 2D arrays (dynamic spatial)
        if isinstance(rain_mmhr, (list, tuple)):
            rain_seq = [np.ascontiguousarray(r, dtype=np.float32) for r in rain_mmhr]
        elif isinstance(rain_mmhr, np.ndarray) and rain_mmhr.ndim == 2:
            rain_seq = [np.ascontiguousarray(rain_mmhr, dtype=np.float32)] * steps
        else:
            rain_val = float(rain_mmhr) / 3_600_000.0  # m/s
            rain_seq = [np.full_like(dem, rain_val, dtype=np.float32)] * steps

        h_frames = [h.copy()]
        u_frames = [u.copy()]
        v_frames = [v.copy()]
        volumes = [float((h * cell_area * fluid_mask).sum())]
        expected_volumes = [volumes[0]]

        step_latencies_ms = []
        static_stack = [dem, mask, rough]

        with torch.no_grad():
            for s in range(1, steps + 1):
                t_step_0 = time.perf_counter()

                rain = rain_seq[s - 1]
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
                h[dry_mask] = 0.0
                u[dry_mask] = 0.0
                v[dry_mask] = 0.0

                # Building boundary condition: zero fluid inside buildings
                bld = (mask > 0.5)
                h[bld] = 0.0
                u[bld] = 0.0
                v[bld] = 0.0

                # Mass conservation tracking and optional projection
                vol_rain_step = float((rain * 60.0 * cell_area * fluid_mask).sum())

                if project_mass:
                    if projection_mode == "flux":
                        # Integrate outward perimeter flux to account for open domain boundaries
                        out_w = np.maximum(0.0, -u[:, 0]) * h[:, 0] * dy_m * 60.0
                        out_e = np.maximum(0.0, u[:, -1]) * h[:, -1] * dy_m * 60.0
                        out_n = np.maximum(0.0, -v[0, :]) * h[0, :] * dx_m * 60.0
                        out_s = np.maximum(0.0, v[-1, :]) * h[-1, :] * dx_m * 60.0
                        step_outflow = float(out_w.sum() + out_e.sum() + out_n.sum() + out_s.sum())
                        vol_expected = expected_volumes[-1] + vol_rain_step - step_outflow
                    else:
                        vol_expected = expected_volumes[-1] + vol_rain_step

                    vol_actual_raw = float((h * cell_area * fluid_mask).sum())
                    if vol_actual_raw > 1e-4:
                        scale_factor = vol_expected / vol_actual_raw
                        # Limit scaling to physically reasonable range [0.5, 2.0]
                        scale_factor = np.clip(scale_factor, 0.5, 2.0)
                        h = (h * scale_factor).astype(np.float32)
                else:
                    vol_expected = expected_volumes[-1] + vol_rain_step

                step_latencies_ms.append((time.perf_counter() - t_step_0) * 1000.0)

                vol_actual = float((h * cell_area * fluid_mask).sum())
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
