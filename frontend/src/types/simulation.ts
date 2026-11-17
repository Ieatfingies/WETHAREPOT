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
  region_id?: string;
  rain_mmhr?: number;
  duration_min?: number;
  engine: SimulationEngine;
  runtime_ms: number;
  meta: SimulationMeta;
  analytics: FloodAnalytics;
  dem: number[][];
  building_mask: number[][];
  frames_h: number[][][];
}

export interface TerrainData {
  region_id: string;
  meta: SimulationMeta;
  dem: number[][];
  building_mask: number[][];
}

export interface HistoricalRunSummary {
  run_id: string;
  region_id: string;
  engine: SimulationEngine;
  rain_mmhr: number;
  duration_min: number;
  status: "queued" | "preparing" | "running" | "post-processing" | "completed" | "failed";
  stage?: string;
  progress?: number;
  runtime_ms?: number;
  error_message?: string;
  analytics?: FloodAnalytics;
  created_at: number;
  completed_at?: number;
}

export interface LiveWeatherReport {
  current: {
    temperature_c: number;
    humidity_pct: number;
    precipitation_mmhr: number;
    weather_code: number;
    condition_text: string;
    wind_speed_kmh: number;
    apparent_temp_c: number;
  };
  hourly_forecast: {
    time: string;
    precipitation_mm: number;
    temperature_c: number;
  }[];
  historical_observations: {
    time: string;
    precipitation_mm: number;
    temperature_c: number;
  }[];
  alerts: {
    id: string;
    severity: string;
    title: string;
    description: string;
    issued_at: string;
    source: string;
  }[];
  provenance: {
    source: string;
    provider: string;
    last_updated_iso: string;
    refresh_interval_sec: number;
    is_live: boolean;
  };
}

export interface CatchmentRiskItem {
  region_id: string;
  name: string;
  center: [number, number];
  risk_score: number;
  tier: "LOW" | "MODERATE" | "HIGH" | "SEVERE";
  severity: string;
  drainage_capacity_mmhr: number;
  estimated_inundation_km2: number;
  critical_landmarks: string[];
  description: string;
}

export interface LiveCatchmentsResponse {
  current_rainfall_mmhr: number;
  max_forecast_rain_mmhr: number;
  updated_at: string;
  catchments: CatchmentRiskItem[];
}

export interface EmergencyFacility {
  id: string;
  name: string;
  type: "police" | "hospital" | "fire_rescue" | "disaster_relief" | string;
  lat: number;
  lon: number;
  address: string;
  phone?: string;
  distance_km: number;
  capabilities?: string[];
  source: string;
}

export interface EmergencyAlert {
  id: string;
  region_id: string;
  region_name: string;
  severity: "Advisory" | "Watch" | "Warning" | "Emergency Action";
  risk_score: number;
  title: string;
  incident_summary: string;
  evidence: Record<string, unknown>;
  status: "active" | "acknowledged" | "escalated" | "dismissed";
  acknowledged_by?: string;
  acknowledged_at?: number;
  resolution_notes?: string;
  created_at: number;
}
