import { useEffect, useMemo, useRef, useState } from "react";
import { fetchHealth, fetchRegions, runFloodSimulation } from "./api/client";
import { ControlSidebar } from "./components/ControlSidebar";
import { FloodMap } from "./components/FloodMap";
import { TimelineBar } from "./components/TimelineBar";
import type {
  HealthStatus,
  RegionInfo,
  SimulationEngine,
  SimulationResponse,
} from "./types/simulation";
import "./styles/neumorphic.css";

const FALLBACK_CENTER: [number, number] = [12.9352, 77.6744];

export function App() {
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string>("bellandur");
  const [rainMmHr, setRainMmHr] = useState<number>(80);
  const [durationMin, setDurationMin] = useState<number>(30);
  const [engine, setEngine] = useState<SimulationEngine>("physics");
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [justSucceeded, setJustSucceeded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResponse | null>(null);

  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);
  const pulseTimerRef = useRef<number | null>(null);

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
        setError(err instanceof Error ? err.message : "Failed to connect to WETHAREPOT API");
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!playing || !result || result.frames_h.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % result.frames_h.length);
    }, 650);
    return () => window.clearInterval(timer);
  }, [playing, result]);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    };
  }, []);

  const activeCenter = useMemo<[number, number]>(() => {
    const found = regions.find((r) => r.id === selectedRegionId);
    return found ? found.center : FALLBACK_CENTER;
  }, [regions, selectedRegionId]);

  const handleSelectRegion = (id: string) => {
    // Optimistic selection update
    setSelectedRegionId(id);
    setPlaying(false);
    setError(null);
  };

  const handleRunSimulation = async () => {
    // Interruptible in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Optimistic UI state before backend response resolves
    const expectedFrames = Math.max(1, Math.floor(durationMin / 5));
    setLoading(true);
    setJustSucceeded(false);
    setError(null);
    setPlaying(false);
    setCurrentFrame(expectedFrames - 1);

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
      setCurrentFrame(Math.max(0, sim.frames_h.length - 1));

      // Trigger success pulse confirmation
      setJustSucceeded(true);
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => setJustSucceeded(false), 700);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Simulation request failed");
    } finally {
      setLoading(false);
    }
  };

  const activeFrameGrid = result?.frames_h[currentFrame] ?? null;

  return (
    <div className="app-shell">
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
        onRunSimulation={handleRunSimulation}
      />

      <main className="map-stage">
        <FloodMap
          center={activeCenter}
          meta={result?.meta ?? null}
          frameH={activeFrameGrid}
          buildingMask={result?.building_mask ?? null}
        />

        {result && (
          <TimelineBar
            frameCount={result.frames_h.length}
            currentFrame={currentFrame}
            intervalMin={5}
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            onSelectFrame={(idx) => {
              setPlaying(false);
              setCurrentFrame(idx);
            }}
          />
        )}
      </main>
    </div>
  );
}

export default App;