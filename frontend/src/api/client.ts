import type {
  HealthStatus,
  RegionInfo,
  SimulationRequest,
  SimulationResponse,
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