import { useState } from "react";
import type {
  LiveWeatherReport,
  LiveCatchmentsResponse,
  CatchmentRiskItem,
  EmergencyFacility,
  EmergencyAlert,
} from "../types/simulation";
import {
  WaterDropIcon,
  ActivityPulseIcon,
  ShieldAlertIcon,
  PoliceBadgeIcon,
  HospitalIcon,
  ResetIcon,
  LayersIcon,
  Cube3DIcon,
} from "./icons/CartographicIcons";

interface LiveCitySidebarProps {
  weather: LiveWeatherReport | null;
  catchmentsData: LiveCatchmentsResponse | null;
  selectedRegionId: string;
  onSelectRegion: (regionId: string) => void;
  facilities: EmergencyFacility[];
  alerts: EmergencyAlert[];
  onAcknowledgeAlert: (alertId: string, action: "acknowledged" | "escalated" | "dismissed") => void;
  onRefresh: () => void;
  isLoading: boolean;
  operatingMode?: "simulation" | "live";
  onSelectOperatingMode?: (mode: "simulation" | "live") => void;
}

export function LiveCitySidebar({
  weather,
  catchmentsData,
  selectedRegionId,
  onSelectRegion,
  facilities,
  alerts,
  onAcknowledgeAlert,
  onRefresh,
  isLoading,
  operatingMode = "live",
  onSelectOperatingMode,
}: LiveCitySidebarProps) {
  const [activeTab, setActiveTab] = useState<"weather" | "catchments" | "emergency">("weather");

  const current = weather?.current;
  const provenance = weather?.provenance;
  const catchments = catchmentsData?.catchments ?? [];

  const getTierClass = (tier: string) => {
    switch (tier) {
      case "SEVERE":
        return "tier-severe";
      case "HIGH":
        return "tier-high";
      case "MODERATE":
        return "tier-moderate";
      default:
        return "tier-low";
    }
  };

  return (
    <aside className="control-sidebar live-city-sidebar" aria-label="Live City Flood Monitoring Control Panel">
      <div className="sidebar-inner">
        {/* Operating Mode Selector inside Sidebar */}
        {onSelectOperatingMode && (
          <div className="sidebar-mode-switcher" role="tablist" aria-label="Digital Twin Operating Mode">
            <button
              type="button"
              role="tab"
              aria-selected={operatingMode === "simulation"}
              className={`sidebar-mode-tab ${operatingMode === "simulation" ? "is-active" : ""}`}
              onClick={() => onSelectOperatingMode("simulation")}
            >
              <Cube3DIcon width={13} height={13} />
              <span>Simulation Lab</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={operatingMode === "live"}
              className={`sidebar-mode-tab ${operatingMode === "live" ? "is-active" : ""}`}
              onClick={() => onSelectOperatingMode("live")}
            >
              <ActivityPulseIcon width={13} height={13} />
              <span>Live City Monitor</span>
              <span className="live-dot-pulse" />
            </button>
          </div>
        )}

        {/* Live City Header */}
        <div className="live-sidebar-header">
          <div className="live-header-status">
            <span className="live-pulse-dot" />
            <span className="live-title-text">BENGALURU LIVE MONITOR</span>
          </div>
          <button
            type="button"
            className={`live-refresh-btn ${isLoading ? "is-spinning" : ""}`}
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh Live City Feed"
            aria-label="Refresh Live Data"
          >
            <ResetIcon width={13} height={13} />
            <span>SYNC</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="live-tabs-nav" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "weather"}
            className={`live-tab-btn ${activeTab === "weather" ? "is-active" : ""}`}
            onClick={() => setActiveTab("weather")}
          >
            <ActivityPulseIcon width={13} height={13} />
            <span>Atmosphere</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "catchments"}
            className={`live-tab-btn ${activeTab === "catchments" ? "is-active" : ""}`}
            onClick={() => setActiveTab("catchments")}
          >
            <LayersIcon width={13} height={13} />
            <span>Catchment Risk ({catchments.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "emergency"}
            className={`live-tab-btn ${activeTab === "emergency" ? "is-active" : ""}`}
            onClick={() => setActiveTab("emergency")}
          >
            <ShieldAlertIcon width={13} height={13} />
            <span>Emergency Facilities</span>
          </button>
        </div>

        {/* Tab 1: Live Atmosphere & Precipitation */}
        {activeTab === "weather" && (
          <div className="live-tab-panel" role="tabpanel">
            {current ? (
              <div className="weather-overview-card">
                <div className="weather-main-row">
                  <div className="weather-temp-block">
                    <span className="temp-large">{current.temperature_c.toFixed(1)}°C</span>
                    <span className="temp-sub">Feels like {current.apparent_temp_c.toFixed(1)}°C</span>
                  </div>
                  <div className="weather-condition-block">
                    <span className="weather-badge-cond">{current.condition_text}</span>
                    <span className="weather-wind-sub">Wind: {current.wind_speed_kmh} km/h</span>
                  </div>
                </div>

                <div className="weather-metrics-grid">
                  <div className="weather-metric-tile">
                    <span className="tile-label">RAINFALL INTENSITY</span>
                    <strong className={`tile-val ${current.precipitation_mmhr > 15 ? "val-alert" : ""}`}>
                      {current.precipitation_mmhr.toFixed(1)} mm/hr
                    </strong>
                    <span className="tile-sub">
                      {current.precipitation_mmhr <= 0
                        ? "Dry surface"
                        : current.precipitation_mmhr < 10
                        ? "Light shower"
                        : current.precipitation_mmhr < 30
                        ? "Moderate rainfall"
                        : "Heavy downpour"}
                    </span>
                  </div>

                  <div className="weather-metric-tile">
                    <span className="tile-label">HUMIDITY</span>
                    <strong className="tile-val">{current.humidity_pct}%</strong>
                    <span className="tile-sub">Atmospheric saturation</span>
                  </div>
                </div>

                {/* 24-Hour Precipitation Forecast Sparkline */}
                {weather?.hourly_forecast && weather.hourly_forecast.length > 0 && (
                  <div className="hourly-forecast-section">
                    <span className="section-label">24-HOUR PRECIPITATION OUTLOOK</span>
                    <div className="hourly-bars-track">
                      {weather.hourly_forecast.slice(0, 12).map((item, idx) => {
                        const maxVal = Math.max(1, ...weather.hourly_forecast.map((h) => h.precipitation_mm));
                        const heightPct = Math.min(100, Math.max(8, (item.precipitation_mm / maxVal) * 100));
                        const hourLabel = item.time.split("T")[1]?.slice(0, 5) ?? `${idx}h`;
                        return (
                          <div key={item.time} className="hourly-bar-col" title={`${hourLabel}: ${item.precipitation_mm}mm`}>
                            <div className="hourly-bar-fill" style={{ height: `${heightPct}%` }} />
                            <span className="hourly-bar-time">{hourLabel.slice(0, 2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="sidebar-empty-state">
                <WaterDropIcon width={24} height={24} />
                <p>Retrieving real-time weather observations for Bengaluru coordinates...</p>
              </div>
            )}

            {/* Provenance Footer */}
            {provenance && (
              <div className="provenance-banner">
                <span className="prov-title">METEOROLOGICAL PROVENANCE</span>
                <span className="prov-source">{provenance.source}</span>
                <span className="prov-time">
                  Synchronised: {new Date(provenance.last_updated_iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST
                </span>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Monitored Catchments & Risk Scores */}
        {activeTab === "catchments" && (
          <div className="live-tab-panel" role="tabpanel">
            <div className="catchment-risk-header">
              <span className="sub-caption">
                Calculated using Copernicus DEM depression indices & localized storm drain capacity.
              </span>
            </div>

            <div className="catchment-risk-list">
              {catchments.map((c: CatchmentRiskItem) => {
                const isSelected = c.region_id === selectedRegionId;
                return (
                  <div
                    key={c.region_id}
                    className={`catchment-risk-item ${isSelected ? "is-selected" : ""}`}
                    onClick={() => onSelectRegion(c.region_id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onSelectRegion(c.region_id);
                    }}
                  >
                    <div className="item-top">
                      <strong className="item-name">{c.name}</strong>
                      <span className={`risk-pill ${getTierClass(c.tier)}`}>{c.tier}</span>
                    </div>

                    <p className="item-desc">{c.description}</p>

                    <div className="item-meta">
                      <span>CAPACITY: {c.drainage_capacity_mmhr} mm/hr</span>
                      <span className="dot">•</span>
                      <span>INUNDATION: ~{c.estimated_inundation_km2} km²</span>
                    </div>

                    {c.critical_landmarks.length > 0 && (
                      <div className="item-landmarks">
                        <span>Hotspots: </span>
                        {c.critical_landmarks.join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Emergency Facilities & Incident Workflow */}
        {activeTab === "emergency" && (
          <div className="live-tab-panel" role="tabpanel">
            {/* Active Alerts Section */}
            <div className="alerts-section">
              <div className="alerts-section-header">
                <ShieldAlertIcon width={14} height={14} />
                <span>ACTIVE RISK INCIDENTS ({alerts.length})</span>
              </div>

              {alerts.length === 0 ? (
                <div className="no-alerts-card">
                  <p>All catchments currently operating within drainage safety thresholds. No active flood emergency incidents.</p>
                </div>
              ) : (
                alerts.map((alt) => (
                  <div key={alt.id} className="emergency-alert-card">
                    <div className="alert-top">
                      <span className="alert-severity-badge">{alt.severity}</span>
                      <span className="alert-time">{new Date(alt.created_at * 1000).toLocaleTimeString("en-IN")}</span>
                    </div>
                    <strong className="alert-title">{alt.title}</strong>
                    <p className="alert-summary">{alt.incident_summary}</p>
                    <div className="alert-actions">
                      <button
                        type="button"
                        className="alert-btn ack-btn"
                        onClick={() => onAcknowledgeAlert(alt.id, "acknowledged")}
                      >
                        Acknowledge
                      </button>
                      <button
                        type="button"
                        className="alert-btn escalate-btn"
                        onClick={() => onAcknowledgeAlert(alt.id, "escalated")}
                      >
                        Escalate
                      </button>
                      <button
                        type="button"
                        className="alert-btn dismiss-btn"
                        onClick={() => onAcknowledgeAlert(alt.id, "dismissed")}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Nearby Verified Facilities */}
            <div className="facilities-section">
              <span className="section-label">VERIFIED EMERGENCY RESPONDERS</span>
              <div className="facilities-list">
                {facilities.map((fac) => (
                  <div key={fac.id} className="facility-card">
                    <div className="facility-header">
                      {fac.type === "police" ? (
                        <PoliceBadgeIcon width={14} height={14} />
                      ) : (
                        <HospitalIcon width={14} height={14} />
                      )}
                      <strong>{fac.name}</strong>
                      <span className="dist-tag">{fac.distance_km} km</span>
                    </div>
                    <p className="fac-address">{fac.address}</p>
                    {fac.phone && <p className="fac-phone">📞 {fac.phone}</p>}
                    {fac.capabilities && (
                      <div className="fac-caps">
                        {fac.capabilities.map((cap) => (
                          <span key={cap} className="cap-tag">{cap}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notification Adapters Status (Modular & Safe) */}
            <div className="notification-adapters-panel">
              <span className="section-label">DISPATCH ADAPTERS</span>
              <div className="adapter-row">
                <span>SMS Emergency Gateway</span>
                <span className="adapter-status inactive">INACTIVE (Requires Auth)</span>
              </div>
              <div className="adapter-row">
                <span>Disaster Management Webhook</span>
                <span className="adapter-status inactive">INACTIVE (Requires Auth)</span>
              </div>
              <p className="adapter-note">
                System-generated risk notifications are advisory and require human operator confirmation before transmission.
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
