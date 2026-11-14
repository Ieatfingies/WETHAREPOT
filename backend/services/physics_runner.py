import shutil
import subprocess
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator
import numpy as np

from backend.core.config import SolverConfig


class SolverExecutionError(RuntimeError):
    """Raised when the C++ SWE solver binary fails or times out."""


@dataclass(frozen=True)
class TerrainInputs:
    dem: np.ndarray
    building_mask: np.ndarray
    roughness: np.ndarray


@contextmanager
def managed_run_workspace(base_dir: Path, run_id: str) -> Iterator[tuple[Path, Path]]:
    """RAII-style context manager guaranteeing deterministic cleanup of temp binary buffers."""
    run_root = base_dir / run_id
    in_dir = run_root / "in"
    out_dir = run_root / "out"
    in_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        yield in_dir, out_dir
    finally:
        shutil.rmtree(run_root, ignore_errors=True)


class CppShallowWaterRunner:
    def __init__(self, cfg: SolverConfig):
        self._cfg = cfg

    def is_available(self) -> bool:
        return self._cfg.executable_path.is_file()

    def run(
        self,
        terrain: TerrainInputs,
        rain_mmhr: float,
        duration_min: int,
        base_runs_dir: Path,
    ) -> tuple[list[np.ndarray], float]:
        if not self.is_available():
            raise SolverExecutionError(
                f"C++ solver binary missing at '{self._cfg.executable_path}'."
            )

        run_id = f"phys_{time.time_ns()}"
        duration_s = float(duration_min * 60)
        interval_s = self._cfg.save_interval_s

        with managed_run_workspace(base_runs_dir, run_id) as (in_dir, out_dir):
            terrain.dem.astype(np.float32).tofile(in_dir / "dem.bin")
            terrain.building_mask.astype(np.float32).tofile(in_dir / "mask.bin")
            terrain.roughness.astype(np.float32).tofile(in_dir / "rough.bin")

            cmd = [
                str(self._cfg.executable_path),
                str(in_dir),
                str(out_dir),
                str(self._cfg.grid_size),
                str(self._cfg.resolution_m),
                str(rain_mmhr),
                str(duration_s),
                str(interval_s),
            ]

            t0 = time.perf_counter()
            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=self._cfg.timeout_s,
                    check=True,
                )
            except subprocess.TimeoutExpired as exc:
                raise SolverExecutionError(
                    f"SWE solver exceeded timeout ({self._cfg.timeout_s}s)."
                ) from exc
            except subprocess.CalledProcessError as exc:
                raise SolverExecutionError(
                    f"SWE solver exited with code {exc.returncode}: {exc.stderr.strip()}"
                ) from exc

            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            if proc.stdout:
                print(proc.stdout.strip())

            n_frames = max(1, int(duration_s // interval_s))
            frames: list[np.ndarray] = []
            shape = (self._cfg.grid_size, self._cfg.grid_size)

            for idx in range(n_frames):
                frame_file = out_dir / f"frame_{idx:04d}_h.bin"
                if not frame_file.is_file():
                    raise SolverExecutionError(f"Expected output frame missing: {frame_file.name}")
                h_grid = np.fromfile(frame_file, dtype=np.float32).reshape(shape)
                frames.append(h_grid)

            return frames, elapsed_ms