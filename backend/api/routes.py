import json
import time
from pathlib import Path
import numpy as np
from fastapi import APIRouter, HTTPException, BackgroundTasks

from backend.core.config import SETTINGS
from backend.core.schemas import HealthResponse, SimulationRequest, SimulationResponse
from backend.core.db import (
    init_db,
    record_simulation_start,
    record_simulation_completion,
    record_simulation_failure,
    list_recent_runs,
    get_run_details,
)
from backend.services.live_weather import fetch_live_weather
from backend.services.catchment_risk import evaluate_catchment_risks
from backend.services.emergency import (
    get_nearby_facilities,
    list_alerts,
    record_alert,
    update_alert_status,
)
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

# Initialize database on startup
init_db()


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


@router.get("/terrain/{region_id}")
def get_region_terrain(region_id: str) -> dict:
    """
    Returns actual Copernicus DEM elevation grid, OSM building mask, and bounds
    for the selected catchment without running the expensive SWE solver.
    Enables instant low-poly 3D digital twin exploration.
    """
    if region_id not in BENGALURU_REGIONS:
        raise HTTPException(status_code=404, detail=f"Unknown region '{region_id}'")

    try:
        npz_path = build_region_grids(
            region_id=region_id,
            grid_size=SETTINGS.solver.grid_size,
            resolution_m=SETTINGS.solver.resolution_m,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed loading terrain: {exc}")

    with open(npz_path.replace(".npz", ".json"), "r", encoding="utf-8") as f:
        meta = json.load(f)

    with np.load(npz_path) as geo:
        dem = np.round(geo["dem"].astype(np.float32), 2).tolist()
        building_mask = geo["building_mask"].astype(np.uint8).tolist()

    return {
        "region_id": region_id,
        "meta": meta,
        "dem": dem,
        "building_mask": building_mask,
    }


@router.get("/runs")
def get_runs() -> dict:
    """Retrieves recent simulation run history and metadata."""
    return {"runs": list_recent_runs(limit=30)}


@router.get("/runs/{run_id}")
def get_single_run(run_id: str) -> dict:
    """Retrieves a historical simulation run with full spatial grids."""
    details = get_run_details(run_id)
    if not details:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    return details


@router.get("/runs/{run_id}/status")
def get_run_status(run_id: str) -> dict:
    """Lightweight real-time status check for long-running simulation jobs."""
    details = get_run_details(run_id)
    if not details:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    return {
        "run_id": details["run_id"],
        "status": details["status"],
        "runtime_ms": details["runtime_ms"],
        "error_message": details.get("error_message"),
    }


def _save_run_result_storage(run_id: str, dem: np.ndarray, building_mask: np.ndarray, frames: list) -> str:
    """Saves heavy simulation output rasters to disk/object storage archive."""
    SETTINGS.runs_base_dir.mkdir(parents=True, exist_ok=True)
    archive_path = SETTINGS.runs_base_dir / f"{run_id}_result.npz"
    np.savez_compressed(
        archive_path,
        dem=dem.astype(np.float32),
        building_mask=building_mask.astype(np.uint8),
        frames_h=np.array(frames, dtype=np.float32),
    )
    return str(archive_path)


@router.post("/simulate", response_model=SimulationResponse)
def simulate_flood(req: SimulationRequest) -> SimulationResponse:
    run_id = f"sim_{time.time_ns()}"
    region_id = req.region_id or "custom"

    # 1. Record start in database
    record_simulation_start(
        run_id=run_id,
        region_id=region_id,
        engine=req.engine,
        rain_mmhr=req.rain_mmhr,
        duration_min=req.duration_min,
    )

    try:
        npz_path = build_region_grids(
            region_id=req.region_id if not req.custom_geojson else None,
            custom_geojson=req.custom_geojson,
            grid_size=SETTINGS.solver.grid_size,
            resolution_m=SETTINGS.solver.resolution_m,
        )
    except ValueError as exc:
        record_simulation_failure(run_id, str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        record_simulation_failure(run_id, f"GIS upstream error: {exc}")
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
        record_simulation_failure(run_id, str(exc))
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except SolverExecutionError as exc:
        record_simulation_failure(run_id, str(exc))
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    analytics = compute_flood_analytics(
        final_depth_m=frames[-1],
        resolution_m=SETTINGS.solver.resolution_m,
        thresholds=SETTINGS.risk,
    )

    # Persist heavy results into storage archive and record in DB
    try:
        storage_path = _save_run_result_storage(
            run_id=run_id,
            dem=terrain.dem,
            building_mask=terrain.building_mask,
            frames=frames,
        )
        record_simulation_completion(
            run_id=run_id,
            runtime_ms=round(runtime_ms, 2),
            meta=meta,
            analytics=analytics.model_dump(),
            result_storage_path=storage_path,
        )
    except Exception as e:
        print(f"Warning: could not persist simulation to DB: {e}")

    return SimulationResponse(
        run_id=run_id,
        engine=req.engine,
        runtime_ms=round(runtime_ms, 2),
        meta=meta,
        analytics=analytics,
        dem=np.round(terrain.dem, 2).tolist(),
        building_mask=terrain.building_mask.astype(np.uint8).tolist(),
        frames_h=[np.round(frame, 3).tolist() for frame in frames],
    )


# ==============================================================================
# MODE B: LIVE CITY MONITOR & EMERGENCY RESPONSE ENDPOINTS
# ==============================================================================

@router.get("/live/weather")
def get_live_weather_feed(lat: float = 12.9716, lon: float = 77.5946) -> dict:
    """Returns authoritative real-time, hourly forecast, and historical weather data."""
    return fetch_live_weather(lat=lat, lon=lon)


@router.get("/live/catchments")
def get_catchment_risk_matrix() -> dict:
    """Evaluates live flood risk scores for all 12 monitored Bengaluru catchments."""
    weather = fetch_live_weather()
    current_rain = weather.get("current", {}).get("precipitation_mmhr", 0.0)
    forecast_precips = [f.get("precipitation_mm", 0.0) for f in weather.get("hourly_forecast", [])]
    max_forecast_rain = max(forecast_precips, default=0.0)

    risks = evaluate_catchment_risks(current_rain, max_forecast_rain)
    return {
        "current_rainfall_mmhr": current_rain,
        "max_forecast_rain_mmhr": max_forecast_rain,
        "updated_at": weather.get("provenance", {}).get("last_updated_iso"),
        "catchments": risks,
    }


@router.get("/live/facilities")
def get_emergency_facilities(lat: float = 12.9716, lon: float = 77.5946, limit: int = 4) -> dict:
    """Finds verified emergency response facilities nearest to the specified coordinate."""
    facilities = get_nearby_facilities(lat=lat, lon=lon, limit=limit)
    return {
        "query_coord": [lat, lon],
        "facilities": facilities,
    }


@router.get("/live/alerts")
def get_emergency_alerts(limit: int = 15) -> dict:
    """Returns active and historical flood risk incident alerts."""
    alerts = list_alerts(limit=limit)
    return {"alerts": alerts}


@router.post("/live/alerts/{alert_id}/action")
def update_alert_workflow(alert_id: str, payload: dict) -> dict:
    """
    Human-in-the-loop workflow:
    Authorised user acknowledges, escalates, or dismisses an emergency incident.
    """
    status = payload.get("status", "acknowledged")
    user = payload.get("user", "Authorised Operator")
    notes = payload.get("notes", "")

    success = update_alert_status(
        alert_id=alert_id,
        status=status,
        acknowledged_by=user,
        resolution_notes=notes,
    )
    if not success:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found.")
    return {"success": True, "alert_id": alert_id, "status": status}

