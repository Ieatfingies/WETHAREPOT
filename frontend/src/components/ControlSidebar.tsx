import { useState, useMemo } from "react";
import type {
  HealthStatus,
  RegionInfo,
  SimulationEngine,
  SimulationResponse,
} from "../types/simulation";
import { CatchmentCombobox } from "./CatchmentCombobox";
import { computeFrameImpact } from "../utils/floodAnalytics";
import {
  CompassRoseIcon,
  HyetographIcon,
  ChronoIcon,
  CpuChipIcon,
  BrainNeuralIcon,
  AlertTriangleIcon,
  InfoIcon,
  SunIcon,
  MoonIcon,
  Cube3DIcon,
  MapIcon,
  HistoryIcon,
  BuildingIcon,
} from "./icons/CartographicIcons";

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
  currentFrame: number;
  viewMode: "2d" | "3d";
  onChangeViewMode: (mode: "2d" | "3d") => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenHistory: () => void;
  onRunSimulation: () => void;
  onNavigate: (route: string) => void;
}

const RAIN_PRESETS = [
  { value: 25, label: "25", stormType: "Monsoon" },
  { value: 50, label: "50", stormType: "Heavy" },
  { value: 80, label: "80", stormType: "Design" },
  { value: 120, label: "120", stormType: "1-in-25 Yr" },
  { value: 160, label: "160", stormType: "Cloudburst" },
];

const DURATION_PRESETS = [
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 45, label: "45m" },
  { value: 60, label: "60m" },
  { value: 120, label: "120m" },
];

function formatMetric(val: number, decimals = 2): string {
  return val.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

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
  loading,
  justSucceeded,
  error,
  result,
  currentFrame,
  viewMode,
  onChangeViewMode,
  theme,
  onToggleTheme,
  onOpenHistory,
  onRunSimulation,
  onNavigate,
}: ControlSidebarProps) {
  const [showSurrogateInfo, setShowSurrogateInfo] = useState(false);

  // Compute actual dynamic frame-by-frame impact metrics (Priority 3)
  const currentFrameImpact = useMemo(() => {
    if (!result || !result.frames_h[currentFrame]) return null;
    return computeFrameImpact(
      result.frames_h[currentFrame],
      result.building_mask,
      result.meta?.resolution_m ?? 10.0
    );
  }, [result, currentFrame]);

  return (
    <aside className="control-sidebar" aria-label="Simulation Controls and Analysis">
      {/* Editorial Field Seal Header with Clean Minimal Layout */}
      <div className="brand-header">
        <div className="brand-topline">
          <div className="brand-seal">
            <div className="brand-mark-box">
              <span className="brand-monogram">W</span>
              <span className="brand-corner tl" />
              <span className="brand-corner tr" />
              <span className="brand-corner bl" />
              <span className="brand-corner br" />
            </div>
            <div className="brand-name-group">
              <span className="brand-name">WETHAREPOT</span>
            </div>
          </div>

          {/* Quick Header Tools: View Toggle, History, and Dark/Light Mode */}
          <div className="header-quick-tools">
            <div className="view-mode-pill" role="radiogroup" aria-label="Visualization Mode">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === "2d" ? "is-active" : ""}`}
                onClick={() => onChangeViewMode("2d")}
                title="2D Cartographic Map"
                aria-pressed={viewMode === "2d"}
              >
                <MapIcon width={14} height={14} />
                <span>2D</span>
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === "3d" ? "is-active" : ""}`}
                onClick={() => onChangeViewMode("3d")}
                title="3D Low-Poly Digital Twin"
                aria-pressed={viewMode === "3d"}
              >
                <Cube3DIcon width={14} height={14} />
                <span>3D</span>
              </button>
            </div>

            <button
              type="button"
              className="header-icon-btn"
              onClick={onOpenHistory}
              title="Simulation History Archive"
              aria-label="Simulation History Archive"
            >
              <HistoryIcon width={16} height={16} />
            </button>

            <button
              type="button"
              className="header-icon-btn theme-toggle-btn"
              onClick={onToggleTheme}
              title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
              aria-label={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
            >
              {theme === "light" ? (
                <MoonIcon width={15} height={15} />
              ) : (
                <SunIcon width={15} height={15} />
              )}
            </button>
          </div>
        </div>

        {/* Global Nav Bar */}
        <nav className="header-nav" aria-label="Platform navigation">
          <button
            type="button"
            className="header-nav-btn is-active"
            aria-current="page"
          >
            Digital Twin
          </button>
          <button
            type="button"
            className="header-nav-btn"
            onClick={() => onNavigate("/methodology")}
          >
            Methodology
          </button>
          <button
            type="button"
            className="header-nav-btn"
            onClick={() => onNavigate("/contact")}
          >
            Contact
          </button>
        </nav>
      </div>

      <div className="sidebar-scroll">
        {/* Step 01: Catchment Study Basin */}
        <section className="control-section">
          <div className="section-heading">
            <span className="section-index">01</span>
            <div>
              <h2 className="section-title">Study Area</h2>
              <p className="section-desc">Select an urban catchment basin across the Bengaluru plateau</p>
            </div>
          </div>

          <CatchmentCombobox
            regions={regions}
            selectedRegionId={selectedRegionId}
            onSelectRegion={onSelectRegion}
            disabled={loading}
          />
        </section>

        {/* Step 02: Rainfall & Storm Parameters */}
        <section className="control-section">
          <div className="section-heading">
            <span className="section-index">02</span>
            <div>
              <h2 className="section-title">Precipitation Scenario</h2>
              <p className="section-desc">Configure rainfall intensity and storm duration</p>
            </div>
          </div>

          {/* Rainfall Intensity Control */}
          <div className="parameter-card">
            <div className="parameter-header">
              <div className="parameter-title-group">
                <HyetographIcon width={16} height={16} className="param-icon" />
                <label htmlFor="rain-slider" className="param-label">
                  RAINFALL INTENSITY
                </label>
              </div>
              <div className="param-numeric-display">
                <input
                  type="number"
                  min="5"
                  max="200"
                  step="5"
                  value={rainMmHr}
                  onChange={(e) => onChangeRain(Math.max(5, Math.min(200, Number(e.target.value))))}
                  disabled={loading}
                  className="param-direct-input tabular-num"
                  aria-label="Direct rainfall intensity value in mm per hour"
                />
                <span className="param-unit">mm/hr</span>
              </div>
            </div>

            <input
              id="rain-slider"
              type="range"
              min="5"
              max="200"
              step="5"
              value={rainMmHr}
              onChange={(e) => onChangeRain(Number(e.target.value))}
              disabled={loading}
              className="editorial-slider"
              aria-label="Rainfall intensity slider in mm/hr"
            />

            <div className="slider-ends">
              <span>5 mm/hr</span>
              <span>200 mm/hr (Extreme)</span>
            </div>

            <div className="preset-chip-row">
              {RAIN_PRESETS.map((preset) => {
                const isActive = rainMmHr === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    className={`preset-chip ${isActive ? "is-active" : ""}`}
                    onClick={() => onChangeRain(preset.value)}
                    disabled={loading}
                    aria-pressed={isActive}
                  >
                    <span className="preset-val tabular-num">{preset.label}</span>
                    <span className="preset-tag">{preset.stormType}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Storm Duration Control */}
          <div className="parameter-card duration-card">
            <div className="parameter-header">
              <div className="parameter-title-group">
                <ChronoIcon width={16} height={16} className="param-icon" />
                <label htmlFor="duration-slider" className="param-label">
                  STORM DURATION
                </label>
              </div>
              <div className="param-numeric-display">
                <input
                  type="number"
                  min="5"
                  max="120"
                  step="5"
                  value={durationMin}
                  onChange={(e) => onChangeDuration(Math.max(5, Math.min(120, Number(e.target.value))))}
                  disabled={loading}
                  className="param-direct-input tabular-num"
                  aria-label="Direct duration value in minutes"
                />
                <span className="param-unit">min</span>
              </div>
            </div>

            <input
              id="duration-slider"
              type="range"
              min="5"
              max="120"
              step="5"
              value={durationMin}
              onChange={(e) => onChangeDuration(Number(e.target.value))}
              disabled={loading}
              className="editorial-slider"
              aria-label="Storm duration slider in minutes"
            />

            <div className="slider-ends">
              <span>5 min</span>
              <span>120 min</span>
            </div>

            <div className="preset-chip-row">
              {DURATION_PRESETS.map((preset) => {
                const isActive = durationMin === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    className={`preset-chip ${isActive ? "is-active" : ""}`}
                    onClick={() => onChangeDuration(preset.value)}
                    disabled={loading}
                    aria-pressed={isActive}
                  >
                    <span className="preset-val tabular-num">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Step 03: Simulation Engine */}
        <section className="control-section">
          <div className="section-heading">
            <span className="section-index">03</span>
            <div>
              <h2 className="section-title">Hydrodynamic Engine</h2>
              <p className="section-desc">Select governing numerical solver or surrogate</p>
            </div>
          </div>

          <div className="engine-card-group" role="radiogroup" aria-label="Simulation Engine Selection">
            {/* Physics Solver Card */}
            <button
              type="button"
              role="radio"
              aria-checked={engine === "physics"}
              className={`engine-card ${engine === "physics" ? "is-selected" : ""}`}
              onClick={() => onChangeEngine("physics")}
              disabled={loading}
            >
              <div className="engine-card-header">
                <div className="engine-radio-circle">
                  <span className="engine-radio-dot" />
                </div>
                <div className="engine-icon-wrap">
                  <CpuChipIcon width={18} height={18} />
                </div>
                <div className="engine-title-wrap">
                  <strong className="engine-name">Physics SWE Solver</strong>
                  <span className="engine-tagline">2D Shallow Water Equations</span>
                </div>
              </div>
              <p className="engine-description">
                Explicit Finite Volume Method with Rusanov numerical fluxes & hydrostatic reconstruction.
                Standardized on metric UTM 43N grid.
              </p>
              <div className="engine-status-row">
                <span className="status-badge available">ACTIVE PRODUCTION</span>
                <span className="status-spec">CFL ≤ 0.45</span>
              </div>
            </button>

            {/* Neural Surrogate Card (Visibly Unavailable / Research) */}
            <div className="engine-card is-disabled" role="radio" aria-checked={false} aria-disabled="true">
              <div className="engine-card-header">
                <div className="engine-radio-circle disabled">
                  <span className="engine-radio-dot" />
                </div>
                <div className="engine-icon-wrap">
                  <BrainNeuralIcon width={18} height={18} />
                </div>
                <div className="engine-title-wrap">
                  <strong className="engine-name">Neural Surrogate</strong>
                  <span className="engine-tagline">Physics-Informed U-Net</span>
                </div>
              </div>
              <p className="engine-description">
                Autoregressive deep convolutional surrogate trained on solver rollouts.
                Held offline per research protocol.
              </p>
              <div className="engine-status-row">
                <span className="status-badge offline">OFFLINE / VALIDATION</span>
                <button
                  type="button"
                  className="info-toggle-btn"
                  onClick={() => setShowSurrogateInfo((v) => !v)}
                  aria-label="Surrogate availability details"
                  title="View research status"
                >
                  <InfoIcon width={13} height={13} />
                </button>
              </div>

              {showSurrogateInfo && (
                <div className="surrogate-notice-box">
                  Per research protocol, U-Net weights are currently undergoing offline validation on 120 Koramangala
                  benchmark samples. Physics solver is fully functional.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Primary Simulation CTA */}
        <div className="cta-section">
          <button
            type="button"
            className={`primary-cta-button ${loading ? "is-loading" : ""} ${
              justSucceeded ? "is-success" : ""
            }`}
            onClick={onRunSimulation}
            disabled={loading || !selectedRegionId}
          >
            {loading ? (
              <span className="cta-content">
                <CompassRoseIcon width={18} height={18} className="cta-spinning-icon" />
                <span>Solving 2D Shallow Water Equations…</span>
              </span>
            ) : justSucceeded ? (
              <span className="cta-content">
                <span className="cta-check">✓</span>
                <span>Hydrodynamic Simulation Synchronized</span>
              </span>
            ) : (
              <span className="cta-content">
                <CompassRoseIcon width={18} height={18} />
                <span>Execute Hydrodynamic Simulation</span>
              </span>
            )}
          </button>
        </div>

        {/* Actionable Human-Readable Error Notice */}
        {error && (
          <div className="error-card" role="alert">
            <div className="error-card-header">
              <AlertTriangleIcon width={18} height={18} className="error-icon" />
              <strong>Simulation Execution Error</strong>
            </div>
            <p className="error-message">{error}</p>
            <div className="error-action-hint">
              <span>Guidance:</span> Ensure the backend FastAPI service is running on <code>127.0.0.1:8000</code> or retry with a shorter storm horizon.
            </div>
          </div>
        )}

        {/* Step 04: Frame-Synchronized Flood Impact Analysis (Priority 3) */}
        {result && currentFrameImpact && (
          <section className="control-section results-section">
            <div className="section-heading">
              <span className="section-index">04</span>
              <div>
                <h2 className="section-title">Flood Impact Analysis</h2>
                <p className="section-desc">
                  Frame <strong className="tabular-num">{currentFrame + 1}</strong> of <strong className="tabular-num">{result.frames_h.length}</strong> • Real-time hydrodynamic impact
                </p>
              </div>
            </div>

            <div className="metrics-grid">
              {/* Max Depth */}
              <div className="metric-tile highlight">
                <div className="metric-tile-header">
                  <span className="metric-label">PEAK INUNDATION DEPTH</span>
                  <span className="metric-tier-tag">
                    {currentFrameImpact.maxDepthM >= 0.6 ? "CRITICAL HAZARD" : currentFrameImpact.maxDepthM >= 0.15 ? "MODERATE HAZARD" : "SHEET FLOW"}
                  </span>
                </div>
                <div className="metric-tile-val">
                  <strong className="tabular-num">{formatMetric(currentFrameImpact.maxDepthM)}</strong>
                  <span className="metric-unit">meters</span>
                </div>
              </div>

              {/* Flooded Area */}
              <div className="metric-tile">
                <span className="metric-label">INUNDATED SURFACE AREA</span>
                <div className="metric-tile-val">
                  <strong className="tabular-num">{formatMetric(currentFrameImpact.floodedAreaKm2)}</strong>
                  <span className="metric-unit">km²</span>
                </div>
              </div>

              {/* Severe Hazard Area */}
              <div className="metric-tile">
                <span className="metric-label">CRITICAL HAZARD (&gt;0.60m)</span>
                <div className="metric-tile-val">
                  <strong className="tabular-num severe-color">{formatMetric(currentFrameImpact.severeHazardKm2)}</strong>
                  <span className="metric-unit">km²</span>
                </div>
              </div>

              {/* Affected Buildings Count */}
              <div className="metric-tile">
                <div className="metric-tile-header">
                  <span className="metric-label">AFFECTED BUILDINGS</span>
                  <BuildingIcon width={13} height={13} className="param-icon" />
                </div>
                <div className="metric-tile-val">
                  <strong className="tabular-num">{currentFrameImpact.affectedBuildingsCount.toLocaleString()}</strong>
                  <span className="metric-unit">structures</span>
                </div>
              </div>

              {/* Total Flood Volume */}
              <div className="metric-tile">
                <span className="metric-label">WATER ACCUMULATION</span>
                <div className="metric-tile-val">
                  <strong className="tabular-num">{formatMetric(currentFrameImpact.totalVolumeM3 / 1000, 1)}</strong>
                  <span className="metric-unit">k m³</span>
                </div>
              </div>

              {/* Spatial Hotspot Cell */}
              {currentFrameImpact.hotspot && (
                <div className="metric-tile">
                  <span className="metric-label">MAX DEPTH HOTSPOT</span>
                  <div className="metric-tile-val">
                    <strong className="tabular-num">{currentFrameImpact.hotspot.depthM} m</strong>
                    <span className="metric-unit">at [{currentFrameImpact.hotspot.row}, {currentFrameImpact.hotspot.col}]</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Editorial Footer Links */}
        <footer className="sidebar-editorial-footer">
          <div className="footer-links">
            <button type="button" onClick={() => onNavigate("/methodology")}>Methodology</button>
            <span className="sep">•</span>
            <button type="button" onClick={() => onNavigate("/privacy")}>Privacy</button>
            <span className="sep">•</span>
            <button type="button" onClick={() => onNavigate("/terms")}>Terms</button>
            <span className="sep">•</span>
            <button type="button" onClick={() => onNavigate("/contact")}>Contact</button>
          </div>
          <p className="footer-disclaimer">
            WETHAREPOT Digital Twin • Physical 2D shallow water PDE modeling.
          </p>
        </footer>
      </div>
    </aside>
  );
}
