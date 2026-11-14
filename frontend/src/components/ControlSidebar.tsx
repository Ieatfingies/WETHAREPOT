import type {
  HealthStatus,
  RegionInfo,
  SimulationEngine,
  SimulationResponse,
} from "../types/simulation";

interface ControlSidebarProps {
  regions: RegionInfo[];
  selectedRegionId: string;
  onSelectRegion: (id: string) => void;
  rainMmHr: number;
  onChangeRain: (value: number) => void;
  durationMin: number;
  onChangeDuration: (value: number) => void;
  engine: SimulationEngine;
  onChangeEngine: (value: SimulationEngine) => void;
  health: HealthStatus | null;
  loading: boolean;
  justSucceeded: boolean;
  error: string | null;
  result: SimulationResponse | null;
  onRunSimulation: () => void;
}

const format = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function ControlSidebar({
  regions,
  selectedRegionId,
  onSelectRegion,
  rainMmHr,
  onChangeRain,
  durationMin,
  onChangeDuration,
  engine,
  onChangeEngine,
  health,
  loading,
  justSucceeded,
  error,
  result,
  onRunSimulation,
}: ControlSidebarProps) {
  const analytics = result?.analytics;

  return (
    <aside className="control-sidebar">
      <div className="brand-row">
        <div className="brand-mark">W</div>
        <div>
          <div className="brand-name">WETHAREPOT</div>
          <div className="brand-caption">URBAN FLOOD INTELLIGENCE</div>
        </div>
      </div>

      <div className="sidebar-scroll">
        <section className="intro-section">
          <div className="eyebrow">BENGALURU DIGITAL TWIN</div>
          <h1>Flood simulator</h1>
          <p>Explore rainfall scenarios and visualize potential urban inundation.</p>
        </section>

        <section className="control-section">
          <div className="section-heading">
            <span className="step-number">01</span>
            <div>
              <h2>Study area</h2>
              <p>Select a catchment to simulate</p>
            </div>
          </div>

          <label className="field-label" htmlFor="region-select">CATCHMENT</label>
          <select
            id="region-select"
            className="field-control"
            value={selectedRegionId}
            onChange={(event) => onSelectRegion(event.target.value)}
          >
            {regions.length === 0 && (
              <option value={selectedRegionId}>{selectedRegionId}</option>
            )}
            {regions.map((region) => (
              <option key={region.id} value={region.id}>{region.name}</option>
            ))}
          </select>

          {regions.find((region) => region.id === selectedRegionId)?.description && (
            <p className="field-hint">
              {regions.find((region) => region.id === selectedRegionId)?.description}
            </p>
          )}
        </section>

        <section className="control-section">
          <div className="section-heading">
            <span className="step-number">02</span>
            <div>
              <h2>Rainfall scenario</h2>
              <p>Configure the storm event</p>
            </div>
          </div>

          <div className="range-heading">
            <label className="field-label" htmlFor="rain-slider">RAINFALL INTENSITY</label>
            <strong>{rainMmHr} <small>mm/hr</small></strong>
          </div>
          <input
            id="rain-slider"
            className="range-control"
            type="range"
            min="5"
            max="200"
            step="5"
            value={rainMmHr}
            onChange={(event) => onChangeRain(Number(event.target.value))}
          />
          <div className="range-ends"><span>5 mm/hr</span><span>200 mm/hr</span></div>

          <div className="preset-row">
            {[25, 50, 80, 120, 160].map((value) => (
              <button
                className={`preset-button ${rainMmHr === value ? "active" : ""}`}
                key={value}
                onClick={() => onChangeRain(value)}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>

          <div className="range-heading duration-heading">
            <label className="field-label" htmlFor="duration-slider">STORM DURATION</label>
            <strong>{durationMin} <small>min</small></strong>
          </div>
          <input
            id="duration-slider"
            className="range-control"
            type="range"
            min="5"
            max="120"
            step="5"
            value={durationMin}
            onChange={(event) => onChangeDuration(Number(event.target.value))}
          />
          <div className="range-ends"><span>5 min</span><span>120 min</span></div>
        </section>

        <section className="control-section">
          <div className="section-heading">
            <span className="step-number">03</span>
            <div>
              <h2>Simulation engine</h2>
              <p>Choose the computation method</p>
            </div>
          </div>

          <div className="engine-options">
            <button
              type="button"
              className={`engine-option ${engine === "physics" ? "selected" : ""}`}
              onClick={() => onChangeEngine("physics")}
            >
              <span className="engine-dot" />
              <span><b>Physics solver</b><small>Shallow-water model</small></span>
            </button>
            <button
              type="button"
              className={`engine-option ${engine === "surrogate" ? "selected" : ""}`}
              onClick={() => onChangeEngine("surrogate")}
            >
              <span className="engine-dot" />
              <span><b>ML surrogate</b><small>U-Net prediction</small></span>
            </button>
          </div>
        </section>

        <button
          className={`run-button ${justSucceeded ? "success" : ""}`}
          type="button"
          onClick={onRunSimulation}
          disabled={loading || !selectedRegionId}
        >
          {loading ? <><span className="button-spinner" /> Running simulation…</> :
            justSucceeded ? "✓ Simulation complete" : "Run flood simulation →"}
        </button>

        {error && <div className="error-panel" role="alert">{error}</div>}

        <section className="status-row">
          <span className={`status-indicator ${health?.status === "ok" ? "online" : ""}`} />
          <span>API {health?.status === "ok" ? "connected" : "not connected"}</span>
          {health && <span className="status-detail">{health.grid_size} × {health.grid_size} grid</span>}
        </section>

        {result && analytics && (
          <section className="results-section">
            <div className="section-heading">
              <span className="step-number">04</span>
              <div><h2>Simulation results</h2><p>Latest completed run</p></div>
            </div>
            <div className="metric-grid">
              <div className="metric-card">
                <span>MAX DEPTH</span>
                <strong>{format(analytics.max_depth_m)}<small> m</small></strong>
              </div>
              <div className="metric-card">
                <span>FLOODED AREA</span>
                <strong>{format(analytics.flooded_area_km2)}<small> km²</small></strong>
              </div>
              <div className="metric-card">
                <span>SEVERE HAZARD</span>
                <strong>{format(analytics.severe_hazard_km2)}<small> km²</small></strong>
              </div>
              <div className="metric-card">
                <span>RUNTIME</span>
                <strong>{format(result.runtime_ms)}<small> ms</small></strong>
              </div>
            </div>
            <div className="result-footnote">
              Run ID: <code>{result.run_id}</code>
            </div>
          </section>
        )}
      </div>

      <footer className="sidebar-footer">
        <span>WETHAREPOT</span>
        <span>BUILD BEYOND ’26</span>
      </footer>
    </aside>
  );
}
