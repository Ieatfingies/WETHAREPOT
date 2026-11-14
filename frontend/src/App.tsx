import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import { FloodMap } from "./components/FloodMap";
import { FloodTwin3D } from "./components/FloodTwin3D";
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
  LayersIcon,
  Cube3DIcon,
  MapIcon,
  ActivityPulseIcon,
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

const FALLBACK_CENTER: [number, number] = [12.9352, 77.6744];

export function App() {
  const { currentPath, navigate } = useRouter();

  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string>("bellandur");
  const [rainMmHr, setRainMmHr] = useState<number>(80);
  const [durationMin, setDurationMin] = useState<number>(30);
  const [engine, setEngine] = useState<SimulationEngine>("physics");
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // Visualization & Theme Modes
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("wetharepot_theme") as "light" | "dark") || "light";
  });

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

  // Mobile & Drawers state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);

  const abortRef = useRef<AbortController | null>(null);
  const pulseTimerRef = useRef<number | null>(null);

  // Sync theme to root DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("wetharepot_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // Initial data loading (Health and Catchments)
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetchHealth(controller.signal), fetchRegions(controller.signal)])
      .then(([healthData, regionList]) => {
        setHealth(healthData);
        setRegions(regionList);
        if (regionList.length > 0 && !regionList.some((r) => r.id === "bellandur")) {
          setSelectedRegionId(regionList[0].id);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to connect to WETHAREPOT simulation services"
        );
      });

    return () => controller.abort();
  }, []);

  // Fetch terrain DEM & building masks when catchment changes (for 3D preview)
  useEffect(() => {
    if (!selectedRegionId) return;
    const controller = new AbortController();

    fetchRegionTerrain(selectedRegionId, controller.signal)
      .then((data) => setTerrainData(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Non-blocking fallback
      });

    return () => controller.abort();
  }, [selectedRegionId]);

  // Frame playback ticker
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

  const activeRegion = useMemo(() => {
    return regions.find((r) => r.id === selectedRegionId);
  }, [regions, selectedRegionId]);

  const activeCenter = useMemo<[number, number]>(() => {
    return activeRegion ? activeRegion.center : FALLBACK_CENTER;
  }, [activeRegion]);

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
    setPlaying(false);
    setError(null);
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
      const sim = await runFloodSimulation(
        {
          region_id: selectedRegionId,
          rain_mmhr: rainMmHr,
          duration_min: durationMin,
          engine,
        },
        controller.signal
      );

      setResult(sim);
      // Synchronize to the final simulation state frame
      setCurrentFrame(Math.max(0, sim.frames_h.length - 1));

      // Trigger subtle success pulse confirmation
      setJustSucceeded(true);
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => setJustSucceeded(false), 800);

      // On mobile, close drawer to reveal the resulting map/3D view
      if (window.innerWidth < 768) {
        setMobileDrawerOpen(false);
      }
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
      setPlaying(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed loading historical run");
    } finally {
      setLoading(false);
    }
  };

  // Active Grids (From simulation result, or pre-simulation terrain)
  const activeDem = result?.dem ?? terrainData?.dem ?? null;
  const activeBuildingMask = result?.building_mask ?? terrainData?.building_mask ?? null;
  const activeMeta = result?.meta ?? terrainData?.meta ?? null;
  const activeFrameGrid = result?.frames_h[currentFrame] ?? null;

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

  // Primary Digital Twin Application
  return (
    <div className="app-shell" data-theme={theme}>
      {/* Mobile Header Bar */}
      <header className="mobile-header-bar" aria-label="Mobile Navigation">
        <div className="mobile-brand">
          <div className="mobile-mark">W</div>
          <span className="mobile-name">WETHAREPOT</span>
        </div>

        {/* Global Operating Mode Switcher */}
        <div className="operating-mode-toggle" role="group" aria-label="Digital Twin Operating Mode">
          <button
            type="button"
            className={`mode-tab-btn ${operatingMode === "simulation" ? "is-active" : ""}`}
            onClick={() => setOperatingMode("simulation")}
            title="Mode A: Simulation Lab (C++ Shallow Water Equations Solver)"
          >
            <Cube3DIcon width={13} height={13} />
            <span>SIMULATION LAB</span>
          </button>

          <button
            type="button"
            className={`mode-tab-btn ${operatingMode === "live" ? "is-active" : ""}`}
            onClick={() => {
              setOperatingMode("live");
              loadLiveData();
            }}
            title="Mode B: Live City Monitor (Bengaluru Real-Time Weather & Flood Risk)"
          >
            <ActivityPulseIcon width={13} height={13} />
            <span>LIVE CITY MONITOR</span>
            <span className="live-dot-pulse" />
          </button>
        </div>

        <div className="mobile-header-actions">
          <button
            type="button"
            className={`mobile-time-toggle ${showTimeTravelBar ? "is-active" : ""}`}
            onClick={() => setShowTimeTravelBar((prev) => !prev)}
            title="Solar Day/Night Replay & Time Travel"
            aria-label="Toggle Time Travel Bar"
          >
            <HistoryIcon width={14} height={14} />
          </button>

          <button
            type="button"
            className="mobile-view-toggle"
            onClick={() => setViewMode((m) => (m === "2d" ? "3d" : "2d"))}
            aria-label="Toggle 2D or 3D view"
          >
            {viewMode === "2d" ? "3D" : "2D"}
          </button>

          <button
            type="button"
            className={`mobile-drawer-toggle ${mobileDrawerOpen ? "is-open" : ""}`}
            onClick={() => setMobileDrawerOpen((v) => !v)}
            aria-label={mobileDrawerOpen ? "View visualization" : "Configure parameters"}
          >
            {mobileDrawerOpen ? (
              <>
                <LayersIcon width={16} height={16} />
                <span>View</span>
              </>
            ) : (
              <>
                <CompassRoseIcon width={16} height={16} />
                <span>Panel</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Control Sidebar (Desktop & Mobile Drawer): Mode A vs Mode B */}
      <div className={`sidebar-container ${mobileDrawerOpen ? "is-mobile-open" : ""}`}>
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
            onToggleTheme={toggleTheme}
            onOpenHistory={() => setHistoryOpen(true)}
            onRunSimulation={handleRunSimulation}
            onNavigate={navigate}
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
          />
        )}
      </div>

      {/* Main Visualization Stage (2D Map / 3D Digital Twin) */}
      <main className="map-stage" aria-label="Hydrodynamic Digital Twin Workspace">
        {/* Floating 2D / 3D View Switcher & Time Travel Toggle in Stage */}
        <div className="stage-view-switcher" role="radiogroup" aria-label="Visualization View Switcher">
          <button
            type="button"
            className={`stage-switch-btn ${viewMode === "2d" ? "is-active" : ""}`}
            onClick={() => setViewMode("2d")}
            title="2D Cartographic Map"
            aria-pressed={viewMode === "2d"}
          >
            <MapIcon width={14} height={14} />
            <span>2D Map</span>
          </button>

          <button
            type="button"
            className={`stage-switch-btn ${viewMode === "3d" ? "is-active" : ""}`}
            onClick={() => setViewMode("3d")}
            title="3D Low-Poly Digital Twin"
            aria-pressed={viewMode === "3d"}
          >
            <Cube3DIcon width={14} height={14} />
            <span>3D Low-Poly Twin</span>
          </button>

          <button
            type="button"
            className={`stage-switch-btn ${showTimeTravelBar ? "is-active" : ""}`}
            onClick={() => setShowTimeTravelBar(!showTimeTravelBar)}
            title="Solar Day/Night Replay & Time Travel"
            aria-pressed={showTimeTravelBar}
          >
            <HistoryIcon width={14} height={14} />
            <span>Solar Clock</span>
          </button>
        </div>

        {viewMode === "2d" ? (
          <FloodMap
            center={activeCenter}
            meta={activeMeta}
            frameH={activeFrameGrid}
            buildingMask={activeBuildingMask}
            selectedRegionName={activeRegion?.name}
          />
        ) : (
          <FloodTwin3D
            dem={activeDem}
            buildingMask={activeBuildingMask}
            frameH={activeFrameGrid}
            meta={activeMeta}
            regionName={activeRegion?.name}
            theme={theme}
            rainfallMmHr={operatingMode === "live" ? (liveWeather?.current?.precipitation_mmhr ?? 0) : rainMmHr}
            timeOfDayHour={timeTravelHour}
            historicalDate={timeTravelDate}
            isHistorical={isHistoricalTime}
          />
        )}

        {/* Dynamic Frame Playback Timeline (In Simulation Lab when results exist) */}
        {operatingMode === "simulation" && result && (
          <TimelineBar
            frameCount={result.frames_h.length}
            currentFrame={currentFrame}
            durationMin={durationMin}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            onSelectFrame={(idx) => {
              setPlaying(false);
              setCurrentFrame(idx);
            }}
          />
        )}

        {/* Solar Day/Night & Historical Time Travel Dock */}
        {(showTimeTravelBar || operatingMode === "live") && (
          <TimeTravelController
            currentHour={timeTravelHour}
            onHourChange={(newHour) => {
              setTimeTravelHour(newHour);
              setIsHistoricalTime(true);
            }}
            selectedDate={timeTravelDate}
            onDateChange={(newDate) => {
              setTimeTravelDate(newDate);
              setIsHistoricalTime(true);
            }}
            isHistorical={isHistoricalTime}
            onResetToLive={() => {
              const now = new Date();
              setTimeTravelDate(now);
              setTimeTravelHour(now.getHours() + now.getMinutes() / 60);
              setIsHistoricalTime(false);
            }}
          />
        )}

        {/* Sticky Mobile Run Bar when drawer is closed on mobile (Simulation Mode) */}
        {operatingMode === "simulation" && (
          <div className="mobile-sticky-action-bar">
            <button
              type="button"
              className="mobile-sticky-run-btn"
              onClick={mobileDrawerOpen ? handleRunSimulation : () => setMobileDrawerOpen(true)}
              disabled={loading}
            >
              {loading ? (
                <span>Solving 2D Shallow Water Equations…</span>
              ) : (
                <span>
                  {mobileDrawerOpen ? "Execute Simulation" : `Configure & Run (${rainMmHr}mm/hr • ${durationMin}m)`}
                </span>
              )}
            </button>
          </div>
        )}
      </main>

      {/* Historical Simulation Run Drawer */}
      <RunHistoryDrawer
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelectRun={handleSelectHistoricalRun}
        activeRunId={result?.run_id}
      />
    </div>
  );
}

export default App;
