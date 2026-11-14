import time
from pathlib import Path
from typing import Optional
import numpy as np

from backend.core.config import SurrogateConfig, SolverConfig
from backend.services.physics_runner import TerrainInputs


class SurrogateUnavailableError(RuntimeError):
    """Raised when Neural Surrogate model weights are not present."""


class NeuralSurrogateRunner:
    def __init__(self, surrogate_cfg: SurrogateConfig, solver_cfg: SolverConfig):
        self._cfg = surrogate_cfg
        self._solver_cfg = solver_cfg
        self._engine: Optional[object] = None

    def _find_valid_weights(self) -> Optional[Path]:
        candidates = [
            self._cfg.weights_path,
            Path("ml/weights/wetharepot_surrogate_final.pth"),
            Path("ml/weights/exp_clean_multiscale_pinn_v2.pth"),
            Path("ml/weights/unet_flood.pth"),
        ]
        return next((p for p in candidates if p.is_file()), None)

    def is_available(self) -> bool:
        return self._find_valid_weights() is not None

    def _get_engine(self):
        if self._engine is None:
            valid_path = self._find_valid_weights()
            if not valid_path:
                raise SurrogateUnavailableError(
                    f"Surrogate model weights not found at '{self._cfg.weights_path}'."
                )
            from ml.inference.predict_experimental import SurrogateRolloutEngine
            self._engine = SurrogateRolloutEngine(str(valid_path))
        return self._engine

    def run(
        self,
        terrain: TerrainInputs,
        rain_mmhr: float,
        duration_min: int,
    ) -> tuple[list[np.ndarray], float]:
        if not self.is_available():
            raise SurrogateUnavailableError(
                f"Neural surrogate model weights not found at '{self._cfg.weights_path}'."
            )

        steps = max(1, int(round((duration_min * 60.0) / self._cfg.macro_step_s)))
        stride = max(1, int(round(self._solver_cfg.save_interval_s / self._cfg.macro_step_s)))

        try:
            engine = self._get_engine()
            t0 = time.perf_counter()
            out = engine.rollout(
                dem=terrain.dem,
                building_mask=terrain.building_mask,
                roughness=terrain.roughness,
                rain_mmhr=rain_mmhr,
                steps=steps,
                dx_m=self._solver_cfg.resolution_m,
                dy_m=self._solver_cfg.resolution_m,
                project_mass=True,
            )
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            all_frames = out["h_frames"]

            # Sample frames at save intervals (e.g. every 5 minutes / 300s)
            saved_frames = [all_frames[i] for i in range(0, len(all_frames), stride)]
            if len(saved_frames) == 0 or not np.array_equal(saved_frames[-1], all_frames[-1]):
                saved_frames.append(all_frames[-1])
            return saved_frames, elapsed_ms

        except Exception as exc:
            # Fallback to baseline rollout
            from ml.inference.predict import rollout_surrogate
            t0 = time.perf_counter()
            raw_frames = rollout_surrogate(
                dem=terrain.dem,
                building_mask=terrain.building_mask,
                roughness=terrain.roughness,
                rain_mmhr=rain_mmhr,
                duration_min=duration_min,
                weights_path=str(self._find_valid_weights()),
            )
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            frames = [np.asarray(f, dtype=np.float32) for f in raw_frames]
            return frames, elapsed_ms
