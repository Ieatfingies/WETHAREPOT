import time
import numpy as np

from backend.core.config import SurrogateConfig, SolverConfig
from backend.services.physics_runner import TerrainInputs


class SurrogateUnavailableError(RuntimeError):
    """Raised when Phase 5 U-Net weights are not yet present."""


class NeuralSurrogateRunner:
    def __init__(self, surrogate_cfg: SurrogateConfig, solver_cfg: SolverConfig):
        self._cfg = surrogate_cfg
        self._solver_cfg = solver_cfg

    def is_available(self) -> bool:
        return self._cfg.weights_path.is_file()

    def run(
        self,
        terrain: TerrainInputs,
        rain_mmhr: float,
        duration_min: int,
    ) -> tuple[list[np.ndarray], float]:
        if not self.is_available():
            raise SurrogateUnavailableError(
                f"Phase 5 model weights not found at '{self._cfg.weights_path}'."
            )

        from ml.inference.predict import rollout_surrogate

        t0 = time.perf_counter()
        raw_frames = rollout_surrogate(
            dem=terrain.dem,
            building_mask=terrain.building_mask,
            roughness=terrain.roughness,
            rain_mmhr=rain_mmhr,
            duration_min=duration_min,
            weights_path=str(self._cfg.weights_path),
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        frames = [np.asarray(f, dtype=np.float32) for f in raw_frames]
        return frames, elapsed_ms