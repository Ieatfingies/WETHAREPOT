import { useEffect, useRef, useState, useCallback } from "react";
import {
  fetchHealth,
  fetchRegions,
  fetchRegionTerrain,
  fetchRunDetails,
  runFloodSimulation,
  fetchLiveWeather,
  fetchLiveCatchments,
  fetchEmergencyFacilities,
  fetchEmergencyAlerts,
  updateAlertAction,
} from "./api/client";
import { ControlSidebar } from "./components/ControlSidebar";
import { LiveCitySidebar } from "./components/LiveCitySidebar";
import { TimeTravelController } from "./components/TimeTravelController";
import { FloodMap, type CustomStudyArea } from "./components/FloodMap";
import { FloodTwin3D } from "./components/FloodTwin3D";
import { CitySearchBox } from "./components/CitySearchBox";
import { TimelineBar } from "./components/TimelineBar";
import { RunHistoryDrawer } from "./components/RunHistoryDrawer";
import { MethodologyPage } from "./components/pages/MethodologyPage";
import { ContactPage } from "./components/pages/ContactPage";
import { PrivacyPolicyPage } from "./components/pages/PrivacyPolicyPage";
import { TermsPage } from "./components/pages/TermsPage";
import { NotFoundPage } from "./components/pages/NotFoundPage";
import { useRouter } from "./router/useRouter";
import {
  CompassRoseIcon,
  Cube3DIcon,
  MapIcon,
  HistoryIcon,
} from "./components/icons/CartographicIcons";
import type {
  HealthStatus,
  RegionInfo,
  SimulationEngine,
  SimulationResponse,
  TerrainData,
  LiveWeatherReport,
  LiveCatchmentsResponse,
  EmergencyFacility,
  EmergencyAlert,
} from "./types/simulation";
import "./styles/neumorphic.css";

const FALLBACK_CENTER: [number, number] = [12.9352, 77.6744]; // Bellandur basin coordinates

export function App() {
  const { currentPath, navigate } = useRouter();

  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string>("bellandur");
  const [rainMmHr, setRainMmHr] = useState<number>(80);
  const [durationMin, setDurationMin] = useState<number>(30);
  const [engine, setEngine] = useState<SimulationEngine>("physics");
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // Enforce pure dark retro-terminal theme
  const theme = "dark";

  // Citywide Search & Custom Study Area Selection
  const [activeCenter, setActiveCenter] = useState<[number, number]>(FALLBACK_CENTER);
  const [activeLocationName, setActiveLocationName] = useState<string>("Bellandur Basin");
  const [customStudyArea, setCustomStudyArea] = useState<CustomStudyArea | null>(null);
  const [isDefiningStudyArea, setIsDefiningStudyArea] = useState<boolean>(false);

  // Visualization Viewport Mode
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");

  // Operating Modes: Mode A (Simulation Lab) vs Mode B (Live City Monitor)
  const [operatingMode, setOperatingMode] = useState<"simulation" | "live">("simulation");
  const [liveWeather, setLiveWeather] = useState<LiveWeatherReport | null>(null);
  const [liveCatchments, setLiveCatchments] = useState<LiveCatchmentsResponse | null>(null);
  const [facilities, setFacilities] = useState<EmergencyFacility[]>([]);
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [liveLoading, setLiveLoading] = useState<boolean>(false);

  // Solar Day/Night & Historical Time Travel state
  const [timeTravelHour, setTimeTravelHour] = useState<number>(() => {
    const n = new Date();
    return n.getHours() + n.getMinutes() / 60;
  });
  const [timeTravelDate, setTimeTravelDate] = useState<Date>(() => new Date());
  const [isHistoricalTime, setIsHistoricalTime] = useState<boolean>(false);
  const [showTimeTravelBar, setShowTimeTravelBar] = useState<boolean>(false);

  // Standalone terrain data (for 3D exploration before simulation run)
  const [terrainData, setTerrainData] = useState<TerrainData | null>(null);

  // Simulation execution & results state
  const [loading, setLoading] = useState<boolean>(false);
  const [justSucceeded, setJustSucceeded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResponse | null>(null);

  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(false);

  // Slide-over Parameter Drawer & Run History Drawer
  const [configDrawerOpen, setConfigDrawerOpen] = useState<boolean>(false);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);

  const abortRef = useRef<AbortController | null>(null);
  const pulseTimerRef = useRef<number | null>(null);

  // Ensure DOM has dark theme attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  // Initial data loading (Health and Catchments)
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetchHealth(controller.signal), fetchRegions(controller.signal)])
      .then(([healthData, regionList]) => {
        setHealth(healthData);
        setRegions(regionList);
        if (regionList.length > 0 && !regionList.some((r) => r.id === "bellandur")) {
          setSelectedRegionId(regionList[0].id);
          setActiveCenter(regionList[0].center);
          setActiveLocationName(regionList[0].name);
        } else if (regionList.length > 0) {
          const b = regionList.find((r) => r.id === "bellandur") || regionList[0];
          setActiveCenter(b.center);
          setActiveLocationName(b.name);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn("Initial metadata check failed; backend may be starting:", err);
      });

    return () => controller.abort();
  }, []);

  // Fetch pre-simulation terrain whenever active catchment changes
  useEffect(() => {
    if (!selectedRegionId) return;
    const controller = new AbortController();
    fetchRegionTerrain(selectedRegionId, controller.signal)
      .then((data) => {
        setTerrainData(data);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn(`Could not preload terrain for ${selectedRegionId}:`, err);
      });

    return () => controller.abort();
  }, [selectedRegionId]);

  // Frame animation timer when playing simulation playback
  useEffect(() => {
    if (!playing || !result || result.frames_h.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % result.frames_h.length);
    }, 700);
    return () => window.clearInterval(timer);
  }, [playing, result]);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    };
  }, []);


  const loadLiveData = useCallback(async () => {
    setLiveLoading(true);
    try {
      const [w, c, a] = await Promise.all([
        fetchLiveWeather(),
        fetchLiveCatchments(),
        fetchEmergencyAlerts(),
      ]);
      setLiveWeather(w);
      setLiveCatchments(c);
      setAlerts(a);
    } catch (e) {
      console.warn("Failed fetching live city updates:", e);
    } finally {
      setLiveLoading(false);
    }
  }, []);

  // Auto-refresh live city data when in Mode B
  useEffect(() => {
    if (operatingMode === "live") {
      let ignore = false;
      queueMicrotask(() => {
        if (!ignore) loadLiveData();
      });
      const interval = setInterval(() => {
        if (!ignore) loadLiveData();
      }, 300000); // 5-minute sync
      return () => {
        ignore = true;
        clearInterval(interval);
      };
    }
  }, [operatingMode, loadLiveData]);

  // Fetch emergency facilities nearest to current active center
  useEffect(() => {
    fetchEmergencyFacilities(activeCenter[0], activeCenter[1], 4)
      .then((facs) => setFacilities(facs))
      .catch((e) => console.warn("Failed fetching emergency facilities:", e));
  }, [activeCenter]);

  const handleAcknowledgeAlert = async (
    alertId: string,
    action: "acknowledged" | "escalated" | "dismissed"
  ) => {
    try {
      await updateAlertAction(alertId, action, "Operator on Duty");
      const updatedAlerts = await fetchEmergencyAlerts();
      setAlerts(updatedAlerts);
    } catch (e) {
      console.warn("Could not update alert action:", e);
    }
  };

  const handleSelectRegion = (id: string) => {
    setSelectedRegionId(id);
    setCustomStudyArea(null);
    const reg = regions.find((r) => r.id === id);
    if (reg) {
      setActiveCenter(reg.center);
      setActiveLocationName(reg.name);
    }
    setPlaying(false);
    setError(null);
  };

  // City Search Box selection handler
  const handleSelectLocation = (lat: number, lon: number, name: string) => {
    setActiveCenter([lat, lon]);
    setActiveLocationName(name);
    setSelectedRegionId("");
    // Automatically center study area around searched landmark
    setIsDefiningStudyArea(true);
  };

  // Custom Study Area Map selection handler
  const handleSelectCustomArea = (area: CustomStudyArea) => {
    setCustomStudyArea(area);
    setActiveCenter(area.center);
    setActiveLocationName(`Custom Study Area (${area.center[0].toFixed(3)}°N, ${area.center[1].toFixed(3)}°E)`);
    setSelectedRegionId("");
    setIsDefiningStudyArea(false);
  };

  const handleRunSimulation = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setJustSucceeded(false);
    setError(null);
    setPlaying(false);

    try {
      const payload = {
        region_id: customStudyArea ? undefined : (selectedRegionId || "bellandur"),
        custom_geojson: customStudyArea ? (customStudyArea.geojson as any) : undefined,
        rain_mmhr: rainMmHr,
        duration_min: durationMin,
        engine,
      };

      const sim = await runFloodSimulation(payload, controller.signal);

      setResult(sim);
      // Synchronize to the final simulation state frame
      setCurrentFrame(Math.max(0, sim.frames_h.length - 1));

      // Trigger subtle success pulse confirmation
      setJustSucceeded(true);
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => setJustSucceeded(false), 800);

      // Close configuration drawer if open so user can enjoy full view
      setConfigDrawerOpen(false);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof Error
          ? err.message
          : "Simulation request failed. Check backend connectivity."
      );
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  };

  const handleSelectHistoricalRun = async (runId: string) => {
    try {
      setLoading(true);
      const pastRun = await fetchRunDetails(runId);
      setResult(pastRun);
      if (pastRun.region_id) {
        setSelectedRegionId(pastRun.region_id);
      }
      setRainMmHr(pastRun.rain_mmhr || 80);
      setDurationMin(pastRun.duration_min || 30);
      setCurrentFrame(Math.max(0, pastRun.frames_h.length - 1));
      setHistoryOpen(false);
      setConfigDrawerOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load past simulation run.");
    } finally {
      setLoading(false);
    }
  };

  // Active Grids (From simulation result, or pre-simulation terrain)
  const activeDem = result?.dem ?? terrainData?.dem ?? null;
  const activeBuildingMask = result?.building_mask ?? terrainData?.building_mask ?? null;
  const activeMeta = result?.meta ?? terrainData?.meta ?? null;
  const activeFrameGrid = result?.frames_h[currentFrame] ?? null;

  // Rain particles active during simulation or rainfall
  const isActivelySimulatingOrPlaying =
    operatingMode === "simulation"
      ? loading || (playing && (result?.rain_mmhr ?? 0) > 0)
      : (liveWeather?.current?.precipitation_mmhr ?? 0) > 0;

  const currentActiveRainMmHr = isActivelySimulatingOrPlaying
    ? (operatingMode === "simulation" ? rainMmHr : (liveWeather?.current?.precipitation_mmhr ?? 0))
    : 0;

  // Route Views Dispatcher
  if (currentPath === "/methodology") {
    return <MethodologyPage onBackToAtlas={() => navigate("/")} />;
  }
  if (currentPath === "/contact") {
    return <ContactPage onBackToAtlas={() => navigate("/")} />;
  }
  if (currentPath === "/privacy") {
    return <PrivacyPolicyPage onBackToAtlas={() => navigate("/")} />;
  }
  if (currentPath === "/terms") {
    return <TermsPage onBackToAtlas={() => navigate("/")} />;
  }
  if (currentPath === "/404") {
    return <NotFoundPage onBackToAtlas={() => navigate("/")} />;
  }

  return (
    <div className="app-shell" data-theme="dark">
      {/* Top Retro-Terminal Command Toolbar */}
      <header className="terminal-topbar" aria-label="Digital Twin Main Navigation">
        <div className="topbar-left">
          {/* Brand Seal */}
          <div className="terminal-brand" onClick={() => navigate("/")} title="WETHAREPOT Digital Twin">
            <span className="terminal-mark">W</span>
            <div className="terminal-title-group">
              <span className="terminal-title">WETHAREPOT</span>
              <span className="terminal-tagline">BENGALURU FLOOD TWIN</span>
            </div>
          </div>

          {/* Operating Mode Tabs */}
          <nav className="terminal-mode-tabs" role="tablist" aria-label="Operating Modes">
            <button
              type="button"
              role="tab"
              aria-selected={operatingMode === "simulation"}
              className={`mode-tab-btn ${operatingMode === "simulation" ? "is-active" : ""}`}
              onClick={() => setOperatingMode("simulation")}
            >
              <span>SIMULATION LAB</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={operatingMode === "live"}
              className={`mode-tab-btn ${operatingMode === "live" ? "is-active" : ""}`}
              onClick={() => setOperatingMode("live")}
            >
              <span className="live-pulse-dot" />
              <span>LIVE CITY MONITOR</span>
            </button>
          </nav>
        </div>

        {/* Center: Citywide Search Box */}
        <div className="topbar-center">
          <CitySearchBox onSelectLocation={handleSelectLocation} />
        </div>

        {/* Right: Quick Stage Controls */}
        <div className="topbar-right">
          {/* 2D / 3D Viewport Toggle */}
          <div className="viewport-toggle-pill" role="radiogroup" aria-label="Viewport Mode">
            <button
              type="button"
              className={`vp-toggle-btn ${viewMode === "2d" ? "is-active" : ""}`}
              onClick={() => setViewMode("2d")}
              title="2D Map View"
              aria-pressed={viewMode === "2d"}
            >
              <MapIcon width={13} height={13} />
              <span>2D MAP</span>
            </button>
            <button
              type="button"
              className={`vp-toggle-btn ${viewMode === "3d" ? "is-active" : ""}`}
              onClick={() => setViewMode("3d")}
              title="3D Digital Twin View"
              aria-pressed={viewMode === "3d"}
            >
              <Cube3DIcon width={13} height={13} />
              <span>3D TWIN</span>
            </button>
          </div>

          {/* Define Custom Study Area Button */}
          <button
            type="button"
            className={`terminal-action-btn define-btn ${isDefiningStudyArea ? "is-defining" : ""}`}
            onClick={() => {
              setIsDefiningStudyArea((prev) => !prev);
              if (viewMode !== "2d") setViewMode("2d");
            }}
            title="Define custom 2.5km study bounding box on the map"
          >
            <span>{isDefiningStudyArea ? "✕ CANCEL" : "⬚ DEFINE AREA"}</span>
          </button>

          {/* Primary Run Simulation Action Button */}
          {operatingMode === "simulation" && (
            <button
              type="button"
              className={`terminal-run-btn ${loading ? "is-loading" : ""} ${justSucceeded ? "is-success" : ""}`}
              onClick={handleRunSimulation}
              disabled={loading}
              title={`Execute ${engine === "physics" ? "C++ Shallow Water" : "ResUNet Neural Surrogate"} Simulation`}
            >
              {loading ? (
                <>
                  <span className="btn-spinner" />
                  <span>SIMULATING...</span>
                </>
              ) : justSucceeded ? (
                <span>SOLVED ✓</span>
              ) : (
                <span>RUN SIMULATION</span>
              )}
            </button>
          )}

          {/* Configuration Slide-Out Trigger */}
          <button
            type="button"
            className={`terminal-icon-btn ${configDrawerOpen ? "is-active" : ""}`}
            onClick={() => setConfigDrawerOpen((prev) => !prev)}
            title="Simulation Parameters & Catchment Selection"
            aria-label="Simulation Parameters"
          >
            <CompassRoseIcon width={15} height={15} />
            <span className="btn-label">CONFIG</span>
          </button>

          {/* Solar Day/Night Clock Trigger */}
          <button
            type="button"
            className={`terminal-icon-btn ${showTimeTravelBar ? "is-active" : ""}`}
            onClick={() => setShowTimeTravelBar((prev) => !prev)}
            title="Solar Day/Night Replay & Astronomical Clock"
            aria-label="Solar Day/Night Clock"
          >
            <HistoryIcon width={15} height={15} />
          </button>
        </div>
      </header>

      {/* Slide-over Parameter & Live Monitor Drawer (Accessible on Demand) */}
      <div className={`terminal-drawer-overlay ${configDrawerOpen ? "is-open" : ""}`} onClick={() => setConfigDrawerOpen(false)} />
      <aside className={`terminal-config-drawer ${configDrawerOpen ? "is-open" : ""}`} aria-label="Configuration Panel">
        <div className="drawer-header">
          <div className="drawer-title-wrap">
            <span className="drawer-badge">{operatingMode === "simulation" ? "SIMULATION PARAMETERS" : "CITYWIDE MONITORING"}</span>
            <strong className="drawer-sub">{activeLocationName}</strong>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={() => setConfigDrawerOpen(false)}
            aria-label="Close configuration panel"
          >
            ✕
          </button>
        </div>

        <div className="drawer-content">
          {operatingMode === "simulation" ? (
            <ControlSidebar
              regions={regions}
              selectedRegionId={selectedRegionId}
              onSelectRegion={handleSelectRegion}
              rainMmHr={rainMmHr}
              onChangeRain={setRainMmHr}
              durationMin={durationMin}
              onChangeDuration={setDurationMin}
              engine={engine}
              onChangeEngine={setEngine}
              health={health}
              loading={loading}
              justSucceeded={justSucceeded}
              error={error}
              result={result}
              currentFrame={currentFrame}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              theme={theme}
              onToggleTheme={() => {}}
              onOpenHistory={() => setHistoryOpen(true)}
              onRunSimulation={handleRunSimulation}
              onNavigate={navigate}
              operatingMode={operatingMode}
              onSelectOperatingMode={setOperatingMode}
            />
          ) : (
            <LiveCitySidebar
              weather={liveWeather}
              catchmentsData={liveCatchments}
              selectedRegionId={selectedRegionId}
              onSelectRegion={handleSelectRegion}
              facilities={facilities}
              alerts={alerts}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              onRefresh={loadLiveData}
              isLoading={liveLoading}
              operatingMode={operatingMode}
              onSelectOperatingMode={setOperatingMode}
            />
          )}
        </div>
      </aside>

      {/* Main Full-Viewport Digital Twin Stage */}
      <main className="map-stage" aria-label="Bengaluru Hydrodynamic Digital Twin">
        {viewMode === "2d" ? (
          <FloodMap
            center={activeCenter}
            meta={activeMeta}
            frameH={activeFrameGrid}
            buildingMask={activeBuildingMask}
            selectedRegionName={activeLocationName}
            isDefiningStudyArea={isDefiningStudyArea}
            onToggleDefineArea={() => setIsDefiningStudyArea((prev) => !prev)}
            onSelectCustomArea={handleSelectCustomArea}
          />
        ) : (
          <FloodTwin3D
            dem={activeDem}
            buildingMask={activeBuildingMask}
            frameH={activeFrameGrid}
            meta={activeMeta}
            regionName={activeLocationName}
            theme={theme}
            rainfallMmHr={currentActiveRainMmHr}
            timeOfDayHour={timeTravelHour}
            historicalDate={timeTravelDate}
            isHistorical={isHistoricalTime}
          />
        )}

        {/* Global Error Alert Banner */}
        {error && (
          <div className="terminal-alert-toast" role="alert">
            <span className="toast-icon">⚠️</span>
            <span className="toast-text">{error}</span>
            <button
              type="button"
              className="toast-dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        )}

        {/* Solar Time Travel & Day/Night Controller */}
        {showTimeTravelBar && (
          <TimeTravelController
            currentHour={timeTravelHour}
            onHourChange={(h) => {
              setTimeTravelHour(h);
              setIsHistoricalTime(true);
            }}
            selectedDate={timeTravelDate}
            onDateChange={(d) => {
              setTimeTravelDate(d);
              setIsHistoricalTime(true);
            }}
            isHistorical={isHistoricalTime}
            onResetToLive={() => {
              const n = new Date();
              setTimeTravelHour(n.getHours() + n.getMinutes() / 60);
              setTimeTravelDate(n);
              setIsHistoricalTime(false);
            }}
          />
        )}

        {/* Bottom Timeline Bar for Frame Synchronization */}
        {operatingMode === "simulation" && result && (
          <TimelineBar
            frameCount={result.frames_h.length}
            currentFrame={currentFrame}
            durationMin={durationMin}
            playing={playing}
            onTogglePlay={() => setPlaying(!playing)}
            onSelectFrame={setCurrentFrame}
          />
        )}
      </main>

      {/* Historical Simulation Runs Modal Drawer */}
      <RunHistoryDrawer
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelectRun={handleSelectHistoricalRun}
      />
    </div>
  );
}

export default App;
