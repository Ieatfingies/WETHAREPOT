import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { Map, ImageSource } from "maplibre-gl";
import type { SimulationMeta } from "../types/simulation";
import { CompassRoseIcon, ResetIcon, LayersIcon } from "./icons/CartographicIcons";
import "maplibre-gl/dist/maplibre-gl.css";

// Configure MapLibre WebWorker securely
maplibregl.setWorkerUrl(maplibreWorkerUrl);

interface FloodMapProps {
  center: [number, number];
  meta: SimulationMeta | null;
  frameH: number[][] | null;
  buildingMask: number[][] | null;
  selectedRegionName?: string;
}

const SOURCE_IDS = ["flood-depth-a", "flood-depth-b"];
const LAYER_IDS = ["flood-depth-layer-a", "flood-depth-layer-b"];
const FLOOD_OPACITY = 0.82;
const FADE_DURATION = 350;

/**
 * Renders the 2D depth grid to a data URL using the restrained bohemian hydrologic palette.
 * No intermediate values are fabricated; maps directly from solver output cells.
 */
function makeFloodImage(grid: number[][]): string {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (!width || !height) return "";

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";

  const image = context.createImageData(width, height);

  for (let row = 0; row < height; row += 1) {
    const rowData = grid[row];
    for (let col = 0; col < width; col += 1) {
      const depth = Number(rowData?.[col] ?? 0);
      const index = (row * width + col) * 4;

      // Inundation cutoff: depths under 1cm (0.01m) are considered negligible surface wetting
      if (!Number.isFinite(depth) || depth <= 0.01) {
        image.data[index + 3] = 0;
        continue;
      }

      let r: number, g: number, b: number, alpha: number;

      if (depth < 0.15) {
        // Shallow Sheet Flow: Clear river blue
        r = 138;
        g = 185;
        b = 194;
        alpha = Math.min(195, 120 + Math.round((depth / 0.15) * 60));
      } else if (depth < 0.30) {
        // Moderate Curb Hazard: River slate blue
        r = 74;
        g = 142;
        b = 162;
        alpha = 210;
      } else if (depth < 0.60) {
        // High Hazard / Vehicle Impassable: Deep river ink
        r = 45;
        g = 95;
        b = 122;
        alpha = 225;
      } else if (depth < 1.00) {
        // Severe Inundation: Muted terracotta clay
        r = 182;
        g = 114;
        b = 82;
        alpha = 235;
      } else {
        // Critical Hazard (>1.0m): Deep burnt earth clay
        r = 148;
        g = 68;
        b = 56;
        alpha = 245;
      }

      image.data[index] = r;
      image.data[index + 1] = g;
      image.data[index + 2] = b;
      image.data[index + 3] = alpha;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function getCoordinates(
  meta: SimulationMeta
): [[number, number], [number, number], [number, number], [number, number]] {
  const [west, south, east, north] = meta.bounds_wgs84;
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}

export function FloodMap({
  center,
  meta,
  frameH,
  selectedRegionName,
}: FloodMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const mapReadyRef = useRef(false);

  const [mapZoom, setMapZoom] = useState(12);
  const latestPropsRef = useRef({ meta, frameH });
  const activeLayerRef = useRef(0);
  const hasFloodRef = useRef(false);

  latestPropsRef.current = { meta, frameH };

  // Initialize MapLibre
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [center[1], center[0]],
      zoom: 12,
      minZoom: 9,
      maxZoom: 18,
      attributionControl: {
        compact: true,
      },
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [
              "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "osm-base",
            type: "raster",
            source: "osm",
          },
        ],
      },
    });

    mapRef.current = map;

    // Navigation control (Zoom in/out, compass)
    const navControl = new maplibregl.NavigationControl({
      showCompass: true,
      showZoom: true,
      visualizePitch: true,
    });
    map.addControl(navControl, "top-right");

    map.on("zoomend", () => {
      setMapZoom(Math.round(map.getZoom() * 10) / 10);
    });

    const addFloodLayer = (
      index: number,
      url: string,
      coordinates: ReturnType<typeof getCoordinates>,
      opacity: number
    ) => {
      map.addSource(SOURCE_IDS[index], {
        type: "image",
        url,
        coordinates,
      });

      map.addLayer({
        id: LAYER_IDS[index],
        type: "raster",
        source: SOURCE_IDS[index],
        paint: {
          "raster-opacity": opacity,
          "raster-opacity-transition": {
            duration: FADE_DURATION,
            delay: 0,
          },
          "raster-fade-duration": 0,
        },
      });
    };

    map.on("load", () => {
      mapReadyRef.current = true;
      map.resize();

      const latest = latestPropsRef.current;
      if (!latest.meta || !latest.frameH?.length) return;

      const url = makeFloodImage(latest.frameH);
      if (!url) return;

      addFloodLayer(0, url, getCoordinates(latest.meta), FLOOD_OPACITY);
      activeLayerRef.current = 0;
      hasFloodRef.current = true;
    });

    return () => {
      mapReadyRef.current = false;
      hasFloodRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // Initialize map once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smoothly center when catchment changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    map.easeTo({
      center: [center[1], center[0]],
      duration: 800,
      easing: (t) => t * (2 - t),
    });
  }, [center]);

  // Crossfade between real simulation frames without inventing data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !meta || !frameH?.length) return;

    const url = makeFloodImage(frameH);
    if (!url) return;

    const coordinates = getCoordinates(meta);

    // Initial frame creation
    if (!hasFloodRef.current) {
      map.addSource(SOURCE_IDS[0], {
        type: "image",
        url,
        coordinates,
      });

      map.addLayer({
        id: LAYER_IDS[0],
        type: "raster",
        source: SOURCE_IDS[0],
        paint: {
          "raster-opacity": FLOOD_OPACITY,
          "raster-opacity-transition": {
            duration: FADE_DURATION,
            delay: 0,
          },
        },
      });

      activeLayerRef.current = 0;
      hasFloodRef.current = true;
      return;
    }

    // Ping-pong crossfade between layer A and layer B
    const oldIndex = activeLayerRef.current;
    const nextIndex = 1 - oldIndex;

    const nextSource = map.getSource(SOURCE_IDS[nextIndex]) as ImageSource | undefined;

    if (nextSource) {
      nextSource.updateImage({
        url,
        coordinates,
      });
    } else {
      map.addSource(SOURCE_IDS[nextIndex], {
        type: "image",
        url,
        coordinates,
      });

      map.addLayer({
        id: LAYER_IDS[nextIndex],
        type: "raster",
        source: SOURCE_IDS[nextIndex],
        paint: {
          "raster-opacity": 0,
          "raster-opacity-transition": {
            duration: FADE_DURATION,
            delay: 0,
          },
        },
      });
    }

    // Crossfade: Hide old layer, reveal new layer
    map.setPaintProperty(LAYER_IDS[oldIndex], "raster-opacity", 0);
    map.setPaintProperty(LAYER_IDS[nextIndex], "raster-opacity", FLOOD_OPACITY);
    activeLayerRef.current = nextIndex;
  }, [meta, frameH]);

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [center[1], center[0]],
      zoom: 13,
      duration: 1000,
    });
  }, [center]);

  return (
    <div className="flood-map-stage-wrapper">
      {/* MapLibre DOM Node */}
      <div
        ref={containerRef}
        className="flood-map-canvas"
        aria-label="Interactive flood depth cartographic map"
      />

      {/* Cartographic Framing Overlay with Corner Crosshairs */}
      <div className="map-neatline-frame" aria-hidden="true">
        <div className="frame-corner top-left" />
        <div className="frame-corner top-right" />
        <div className="frame-corner bottom-left" />
        <div className="frame-corner bottom-right" />
      </div>

      {/* Top Left Cartographic HUD Plaque */}
      <div className="map-hud-plaque">
        <div className="hud-badge">
          <CompassRoseIcon width={14} height={14} />
          <span className="hud-title">{selectedRegionName || "STUDY AREA"}</span>
        </div>
        <div className="hud-coords tabular-num">
          {center[0].toFixed(4)}°N, {center[1].toFixed(4)}°E
        </div>
        <div className="hud-meta">
          <span>CRS: EPSG:32643</span>
          <span className="dot">•</span>
          <span>ZOOM: {mapZoom}x</span>
        </div>
      </div>

      {/* Quick Action Map Tool: Recenter */}
      <div className="map-quick-tools">
        <button
          type="button"
          className="map-tool-btn"
          onClick={handleRecenter}
          title="Recenter map on active catchment"
          aria-label="Recenter map"
        >
          <ResetIcon width={16} height={16} />
        </button>
      </div>

      {/* Hydrologic Water Depth Legend */}
      <div className="map-depth-legend" role="region" aria-label="Water Depth Legend">
        <div className="legend-header">
          <LayersIcon width={14} height={14} />
          <span className="legend-title">WATER DEPTH (m)</span>
        </div>

        <div className="legend-list">
          <div className="legend-item">
            <span className="legend-swatch shallow" aria-hidden="true" />
            <span className="legend-range tabular-num">0.03 – 0.15 m</span>
            <span className="legend-tier">Sheet Flow</span>
          </div>

          <div className="legend-item">
            <span className="legend-swatch moderate" aria-hidden="true" />
            <span className="legend-range tabular-num">0.15 – 0.30 m</span>
            <span className="legend-tier">Curb Overflow</span>
          </div>

          <div className="legend-item">
            <span className="legend-swatch high" aria-hidden="true" />
            <span className="legend-range tabular-num">0.30 – 0.60 m</span>
            <span className="legend-tier">Hazard / Vehicles</span>
          </div>

          <div className="legend-item">
            <span className="legend-swatch severe" aria-hidden="true" />
            <span className="legend-range tabular-num">0.60 – 1.00 m</span>
            <span className="legend-tier">Severe / Structural</span>
          </div>

          <div className="legend-item">
            <span className="legend-swatch extreme" aria-hidden="true" />
            <span className="legend-range tabular-num">&gt; 1.00 m</span>
            <span className="legend-tier">Critical Inundation</span>
          </div>
        </div>
      </div>
    </div>
  );
}
