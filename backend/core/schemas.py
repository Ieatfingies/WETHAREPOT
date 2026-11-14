from typing import Literal, Any
from pydantic import BaseModel, Field, model_validator


class SimulationRequest(BaseModel):
    region_id: str | None = Field(default="bellandur", description="Preset Bengaluru catchment ID")
    custom_geojson: dict[str, Any] | None = Field(default=None, description="Optional WGS84 Polygon GeoJSON")
    rain_mmhr: float = Field(default=80.0, ge=0.0, le=500.0, description="Uniform rainfall intensity (mm/hr)")
    duration_min: int = Field(default=30, ge=5, le=180, description="Simulation horizon in minutes")
    engine: Literal["physics", "surrogate"] = Field(default="physics")

    @model_validator(mode="after")
    def validate_target_area(self) -> "SimulationRequest":
        if not self.region_id and not self.custom_geojson:
            raise ValueError("Either 'region_id' or 'custom_geojson' must be supplied.")
        return self


class FloodAnalytics(BaseModel):
    max_depth_m: float
    mean_depth_m: float
    flooded_area_km2: float
    moderate_hazard_km2: float
    severe_hazard_km2: float
    total_volume_m3: float
    inundated_cell_count: int


class SimulationResponse(BaseModel):
    run_id: str
    engine: Literal["physics", "surrogate"]
    runtime_ms: float
    meta: dict[str, Any]
    analytics: FloodAnalytics
    dem: list[list[float]]
    building_mask: list[list[int]]
    frames_h: list[list[list[float]]]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    solver_ready: bool
    surrogate_ready: bool
    grid_size: int
    resolution_m: float