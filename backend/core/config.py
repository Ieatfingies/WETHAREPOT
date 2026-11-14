from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class SolverConfig:
    executable_path: Path = Path("build/swe_solver_oneway.exe")
    grid_size: int = 256
    resolution_m: float = 10.0
    save_interval_s: float = 300.0
    timeout_s: float = 60.0


@dataclass(frozen=True)
class SurrogateConfig:
    weights_path: Path = Path("ml/weights/unet_flood.pth")
    macro_step_s: float = 60.0


@dataclass(frozen=True)
class FloodRiskThresholds:
    inundation_cutoff_m: float = 0.05
    moderate_hazard_m: float = 0.30
    severe_hazard_m: float = 0.75


@dataclass(frozen=True)
class AppSettings:
    title: str = "WETHAREPOT Flood Forecasting API"
    version: str = "1.0.0"
    runs_base_dir: Path = Path("data/processed/api_runs")
    solver: SolverConfig = SolverConfig()
    surrogate: SurrogateConfig = SurrogateConfig()
    risk: FloodRiskThresholds = FloodRiskThresholds()


SETTINGS = AppSettings()