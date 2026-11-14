export type SimulationEngine = "physics" | "surrogate";

export interface RegionInfo {
  id: string;
  name: string;
  center: [number, number];
  description?: string;
}

export interface HealthStatus {
  status: "ok";
  solver_ready: boolean;
  surrogate_ready: boolean;
  grid_size: number;
  resolution_m: number;
}

export interface SimulationMeta {
  region_id?: string;
  bounds_wgs84: [number, number, number, number];
  grid_size: number;
  resolution_m: number;
}

export interface FloodAnalytics {
  max_depth_m: number;
  mean_depth_m: number;
  flooded_area_km2: number;
  moderate_hazard_km2: number;
  severe_hazard_km2: number;
  total_volume_m3: number;
  inundated_cell_count: number;
}

export interface SimulationRequest {
  region_id?: string | null;
  custom_geojson?: Record<string, unknown> | null;
  rain_mmhr: number;
  duration_min: number;
  engine: SimulationEngine;
}

export interface SimulationResponse {
  run_id: string;
  engine: SimulationEngine;
  runtime_ms: number;
  meta: SimulationMeta;
  analytics: FloodAnalytics;
  dem: number[][];
  building_mask: number[][];
  frames_h: number[][][];
}