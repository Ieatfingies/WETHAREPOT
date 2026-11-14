import type {
  HealthStatus,
  RegionInfo,
  SimulationRequest,
  SimulationResponse,
  TerrainData,
  HistoricalRunSummary,
  LiveWeatherReport,
  LiveCatchmentsResponse,
  EmergencyFacility,
  EmergencyAlert,
} from "../types/simulation";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api";

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // Fall back to HTTP status text
  }
  return `HTTP ${res.status}: ${res.statusText}`;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE}/health`, { signal });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<HealthStatus>;
}

export async function fetchRegions(signal?: AbortSignal): Promise<RegionInfo[]> {
  const res = await fetch(`${API_BASE}/regions`, { signal });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { regions: RegionInfo[] };
  return data.regions;
}

export async function fetchRegionTerrain(
  regionId: string,
  signal?: AbortSignal
): Promise<TerrainData> {
  const res = await fetch(`${API_BASE}/terrain/${encodeURIComponent(regionId)}`, { signal });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<TerrainData>;
}

export async function fetchRecentRuns(signal?: AbortSignal): Promise<HistoricalRunSummary[]> {
  const res = await fetch(`${API_BASE}/runs`, { signal });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { runs: HistoricalRunSummary[] };
  return data.runs;
}

export async function fetchRunDetails(
  runId: string,
  signal?: AbortSignal
): Promise<SimulationResponse> {
  const res = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}`, { signal });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SimulationResponse>;
}

export async function fetchLiveWeather(
  lat: number = 12.9716,
  lon: number = 77.5946,
  signal?: AbortSignal
): Promise<LiveWeatherReport> {
  const res = await fetch(`${API_BASE}/live/weather?lat=${lat}&lon=${lon}`, { signal });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LiveWeatherReport>;
}

export async function fetchLiveCatchments(
  signal?: AbortSignal
): Promise<LiveCatchmentsResponse> {
  const res = await fetch(`${API_BASE}/live/catchments`, { signal });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LiveCatchmentsResponse>;
}

export async function fetchEmergencyFacilities(
  lat: number,
  lon: number,
  limit: number = 4,
  signal?: AbortSignal
): Promise<EmergencyFacility[]> {
  const res = await fetch(`${API_BASE}/live/facilities?lat=${lat}&lon=${lon}&limit=${limit}`, { signal });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { facilities: EmergencyFacility[] };
  return data.facilities;
}

export async function fetchEmergencyAlerts(
  limit: number = 15,
  signal?: AbortSignal
): Promise<EmergencyAlert[]> {
  const res = await fetch(`${API_BASE}/live/alerts?limit=${limit}`, { signal });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { alerts: EmergencyAlert[] };
  return data.alerts;
}

export async function updateAlertAction(
  alertId: string,
  status: "acknowledged" | "escalated" | "dismissed",
  user: string = "Authorised Operator",
  notes: string = ""
): Promise<{ success: boolean; alert_id: string; status: string }> {
  const res = await fetch(`${API_BASE}/live/alerts/${encodeURIComponent(alertId)}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, user, notes }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function runFloodSimulation(
  payload: SimulationRequest,
  signal?: AbortSignal
): Promise<SimulationResponse> {
  const res = await fetch(`${API_BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SimulationResponse>;
}
