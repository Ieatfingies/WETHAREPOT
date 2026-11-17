import json
import gzip
import os
import struct
import time
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from fastapi import APIRouter, HTTPException, Response

from backend.core.config import SETTINGS
from backend.core.schemas import HealthResponse, SimulationRequest
from backend.core.db import (
    init_db,
    record_simulation_completion,
    record_simulation_failure,
    list_recent_runs,
    get_run_details,
    get_run_result_arrays,
    get_run_status as db_get_run_status,
    set_simulation_stage,
    create_simulation_job,
    simulation_request_hash,
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
_job_executor = ThreadPoolExecutor(max_workers=max(1, int(os.getenv("SIMULATION_JOB_WORKERS", "1"))), thread_name_prefix="flood-job")

_physics_runner = CppShallowWaterRunner(SETTINGS.solver)
_surrogate_runner = NeuralSurrogateRunner(SETTINGS.surrogate, SETTINGS.solver)

# Initialize database on startup
init_db()


@lru_cache(maxsize=8)
def _cached_terrain(npz_path: str) -> TerrainInputs:
    with np.load(npz_path) as geo:
        arrays = [np.asarray(geo[key], dtype=np.float32) for key in ("dem", "building_mask", "roughness")]
    for array in arrays:
        array.setflags(write=False)
    return TerrainInputs(*arrays)


def _run_job_guarded(run_id: str, req: SimulationRequest) -> None:
    try:
        _execute_simulation(run_id, req)
    except Exception as exc:
        record_simulation_failure(run_id, f"Simulation job failed: {exc}")


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

    terrain = _cached_terrain(npz_path)
    dem = np.round(terrain.dem, 2).tolist()
    building_mask = terrain.building_mask.astype(np.uint8, copy=False).tolist()

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


@router.get("/runs/{run_id}/grid-bundle")
def get_single_run_grid_bundle(run_id: str) -> Response:
    """Compact gzip-compressed row-major float32/uint8 grids for the web client."""
    run = get_run_result_arrays(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Completed result for run '{run_id}' not found.")
    if run["status"] != "completed":
        raise HTTPException(status_code=409, detail=f"Run '{run_id}' is {run['status']}.")
    arrays = [np.ascontiguousarray(run["dem"], dtype=np.float32), np.ascontiguousarray(run["building_mask"], dtype=np.uint8), np.ascontiguousarray(run["frames_h"], dtype=np.float32)]
    header = {key: run[key] for key in ("run_id", "region_id", "engine", "rain_mmhr", "duration_min", "status", "runtime_ms", "meta", "analytics")}
    header["shape"] = list(arrays[0].shape)
    header["frame_count"] = int(arrays[2].shape[0])
    encoded_header = json.dumps(header, separators=(",", ":")).encode("utf-8")
    padding = bytes((-len(encoded_header)) % 4)
    frame_padding = bytes((-arrays[1].nbytes) % 4)
    body = struct.pack("<I", len(encoded_header)) + encoded_header + padding + arrays[0].tobytes() + arrays[1].tobytes() + frame_padding + arrays[2].tobytes()
    return Response(gzip.compress(body, compresslevel=1), media_type="application/vnd.wetharepot.grid-bundle", headers={"Content-Encoding": "gzip", "Cache-Control": "private, no-store"})


@router.get("/runs/{run_id}/status")
def get_run_status_route(run_id: str) -> dict:
    """Lightweight real-time status check for long-running simulation jobs."""
    details = db_get_run_status(run_id)
    if not details:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found.")
    return {
        "run_id": details["run_id"],
        "status": details["status"],
        "runtime_ms": details["runtime_ms"],
        "stage": details["stage"], "progress": details["progress"],
        "error_message": details.get("error_message"),
    }


def _save_run_result_storage(run_id: str, dem: np.ndarray, building_mask: np.ndarray, frames: list) -> str:
    """Saves heavy simulation output rasters to disk/object storage archive."""
    SETTINGS.runs_base_dir.mkdir(parents=True, exist_ok=True)
    archive_path = SETTINGS.runs_base_dir / f"{run_id}_result.npz"
    np.savez(
        archive_path,
        dem=dem.astype(np.float32),
        building_mask=building_mask.astype(np.uint8),
        frames_h=np.array(frames, dtype=np.float32),
    )
    return str(archive_path)


def _execute_simulation(run_id: str, req: SimulationRequest) -> None:
    region_id = req.region_id or "custom"
    try:
        set_simulation_stage(run_id, "preparing", 0)
        npz_path = build_region_grids(
            region_id=req.region_id if not req.custom_geojson else None,
            custom_geojson=req.custom_geojson,
            grid_size=SETTINGS.solver.grid_size,
            resolution_m=SETTINGS.solver.resolution_m,
        )
        set_simulation_stage(run_id, "running", 33)
    except Exception as exc:
        record_simulation_failure(run_id, f"Terrain preparation failed: {exc}")
        return

    with open(npz_path.replace(".npz", ".json"), "r", encoding="utf-8") as f:
        meta = json.load(f)

    terrain = _cached_terrain(npz_path)

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
        return
    except SolverExecutionError as exc:
        record_simulation_failure(run_id, str(exc))
        return

    set_simulation_stage(run_id, "post-processing", 66)
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
        record_simulation_failure(run_id, f"Could not persist simulation result: {e}")


@router.post("/simulate")
def simulate_flood(req: SimulationRequest) -> dict:
    payload = req.model_dump(mode="json")
    request_hash = simulation_request_hash(payload)
    run_id = f"sim_{time.time_ns()}"
    accepted = create_simulation_job(run_id, req.region_id or "custom", req.engine, req.rain_mmhr, req.duration_min, request_hash)
    if not accepted["duplicate"]:
        _job_executor.submit(_run_job_guarded, accepted["run_id"], req)
    return accepted


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

