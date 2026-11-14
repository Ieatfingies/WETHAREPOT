import json
import time
import numpy as np
from fastapi import APIRouter, HTTPException

from backend.core.config import SETTINGS
from backend.core.schemas import HealthResponse, SimulationRequest, SimulationResponse
from backend.services.analytics import compute_flood_analytics
from backend.services.physics_runner import (
    CppShallowWaterRunner,
    SolverExecutionError,
    TerrainInputs,
)
from backend.services.surrogate_runner import (
    NeuralSurrogateRunner,
    SurrogateUnavailableError,
)
from geospatial.acquisition.regions import BENGALURU_REGIONS
from geospatial.grid_generation.builder import build_region_grids

router = APIRouter(prefix="/api")

_physics_runner = CppShallowWaterRunner(SETTINGS.solver)
_surrogate_runner = NeuralSurrogateRunner(SETTINGS.surrogate, SETTINGS.solver)


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        solver_ready=_physics_runner.is_available(),
        surrogate_ready=_surrogate_runner.is_available(),
        grid_size=SETTINGS.solver.grid_size,
        resolution_m=SETTINGS.solver.resolution_m,
    )


@router.get("/regions")
def get_regions() -> dict:
    return {"regions": [{"id": k, **v} for k, v in BENGALURU_REGIONS.items()]}


@router.post("/simulate", response_model=SimulationResponse)
def simulate_flood(req: SimulationRequest) -> SimulationResponse:
    try:
        npz_path = build_region_grids(
            region_id=req.region_id if not req.custom_geojson else None,
            custom_geojson=req.custom_geojson,
            grid_size=SETTINGS.solver.grid_size,
            resolution_m=SETTINGS.solver.resolution_m,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"GIS upstream error: {exc}") from exc

    with open(npz_path.replace(".npz", ".json"), "r", encoding="utf-8") as f:
        meta = json.load(f)

    with np.load(npz_path) as geo:
        terrain = TerrainInputs(
            dem=geo["dem"].astype(np.float32),
            building_mask=geo["building_mask"].astype(np.float32),
            roughness=geo["roughness"].astype(np.float32),
        )

    try:
        if req.engine == "physics":
            frames, runtime_ms = _physics_runner.run(
                terrain=terrain,
                rain_mmhr=req.rain_mmhr,
                duration_min=req.duration_min,
                base_runs_dir=SETTINGS.runs_base_dir,
            )
        else:
            frames, runtime_ms = _surrogate_runner.run(
                terrain=terrain,
                rain_mmhr=req.rain_mmhr,
                duration_min=req.duration_min,
            )
    except SurrogateUnavailableError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except SolverExecutionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    analytics = compute_flood_analytics(
        final_depth_m=frames[-1],
        resolution_m=SETTINGS.solver.resolution_m,
        thresholds=SETTINGS.risk,
    )

    return SimulationResponse(
        run_id=f"sim_{time.time_ns()}",
        engine=req.engine,
        runtime_ms=round(runtime_ms, 2),
        meta=meta,
        analytics=analytics,
        dem=np.round(terrain.dem, 2).tolist(),
        building_mask=terrain.building_mask.astype(np.uint8).tolist(),
        frames_h=[np.round(frame, 3).tolist() for frame in frames],
    )