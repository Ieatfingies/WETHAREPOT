import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { Map, ImageSource } from "maplibre-gl";
import type { SimulationMeta } from "../types/simulation";
import { CompassRoseIcon, ResetIcon, LayersIcon } from "./icons/CartographicIcons";
import "maplibre-gl/dist/maplibre-gl.css";

// Configure MapLibre WebWorker securely
maplibregl.setWorkerUrl(maplibreWorkerUrl);

export interface CustomStudyArea {
  geojson: {
    type: "Polygon";
    coordinates: number[][][];
  };
  bounds: [number, number, number, number]; // [west, south, east, north]
  center: [number, number]; // [lat, lon]
  dimensionsKm: { widthKm: number; heightKm: number; areaKm2: number };
}

interface FloodMapProps {
  center: [number, number];
  meta: SimulationMeta | null;
  frameH: number[][] | null;
  buildingMask: number[][] | null;
  selectedRegionName?: string;
  isDefiningStudyArea?: boolean;
  onToggleDefineArea?: () => void;
  onSelectCustomArea?: (area: CustomStudyArea) => void;
}

const SOURCE_IDS = ["flood-depth-a", "flood-depth-b"];
const LAYER_IDS = ["flood-depth-layer-a", "flood-depth-layer-b"];
const FLOOD_OPACITY = 0.82;
const FADE_DURATION = 350;

const STUDY_BOX_SOURCE = "custom-study-area-source";
const STUDY_BOX_FILL = "custom-study-area-fill";
const STUDY_BOX_LINE = "custom-study-area-line";

/**
 * Converts a center lat/lon into a 2.56km x 2.56km standard WGS84 polygon.
 * 2560m in Bengaluru (~12.97° N):
 * 1 deg lat ≈ 110,600m => deltaLat ≈ 2560 / 110600 ≈ 0.0231°
 * 1 deg lon ≈ 111,320m * cos(12.97°) ≈ 108,500m => deltaLon ≈ 2560 / 108500 ≈ 0.0236°
 */
function createStudyAreaPolygon(lat: number, lon: number): CustomStudyArea {
  const dLat = 0.0231 / 2.0;
  const dLon = 0.0236 / 2.0;

  const west = lon - dLon;
  const east = lon + dLon;
  const south = lat - dLat;
  const north = lat + dLat;

  const coordinates = [
    [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
      [west, north],
    ],
  ];

  return {
    geojson: {
      type: "Polygon",
      coordinates,
    },
    bounds: [west, south, east, north],
    center: [lat, lon],
    dimensionsKm: {
      widthKm: 2.56,
      heightKm: 2.56,
      areaKm2: 6.55,
    },
  };
}

/**
 * Renders the 2D depth grid to a data URL using the hydrologic palette.
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

      if (!Number.isFinite(depth) || depth <= 0.01) {
        image.data[index + 3] = 0;
        continue;
      }

      let r: number, g: number, b: number, alpha: number;

      if (depth < 0.15) {
        r = 138;
        g = 185;
        b = 194;
        alpha = Math.min(195, 120 + Math.round((depth / 0.15) * 60));
      } else if (depth < 0.30) {
        r = 74;
        g = 142;
        b = 162;
        alpha = 210;
      } else if (depth < 0.60) {
        r = 45;
        g = 95;
        b = 122;
        alpha = 225;
      } else if (depth < 1.00) {
        r = 182;
        g = 114;
        b = 82;
        alpha = 235;
      } else {
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
  isDefiningStudyArea = false,
  onToggleDefineArea,
  onSelectCustomArea,
}: FloodMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const mapReadyRef = useRef(false);

  const [mapZoom, setMapZoom] = useState(12);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [activeCustomArea, setActiveCustomArea] = useState<CustomStudyArea | null>(null);

  const latestPropsRef = useRef({ meta, frameH });
  const activeLayerRef = useRef(0);
  const hasFloodRef = useRef(false);

  useEffect(() => {
    latestPropsRef.current = { meta, frameH };
  }, [meta, frameH]);

  const initialCenterRef = useRef(center);

  // Initialize MapLibre
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter = initialCenterRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [initialCenter[1], initialCenter[0]],
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

    map.on("mousemove", (e) => {
      setCursorCoords({
        lat: Math.round(e.lngLat.lat * 10000) / 10000,
        lng: Math.round(e.lngLat.lng * 10000) / 10000,
      });
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

      // Setup custom study area layers
      const defaultArea = createStudyAreaPolygon(initialCenter[0], initialCenter[1]);
      map.addSource(STUDY_BOX_SOURCE, {
        type: "geojson",
        data: defaultArea.geojson as any,
      });

      map.addLayer({
        id: STUDY_BOX_FILL,
        type: "fill",
        source: STUDY_BOX_SOURCE,
        paint: {
          "fill-color": "#ff6b00",
          "fill-opacity": 0.12,
        },
      });

      map.addLayer({
        id: STUDY_BOX_LINE,
        type: "line",
        source: STUDY_BOX_SOURCE,
        paint: {
          "line-color": "#ff6b00",
          "line-width": 2.5,
          "line-dasharray": [3, 2],
        },
      });

      // Default hidden unless defining area or meta exists
      map.setLayoutProperty(STUDY_BOX_FILL, "visibility", "none");
      map.setLayoutProperty(STUDY_BOX_LINE, "visibility", "none");

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
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update study area on map click when define mode is active
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      if (!isDefiningStudyArea) return;
      const lat = e.lngLat.lat;
      const lon = e.lngLat.lng;

      const newArea = createStudyAreaPolygon(lat, lon);
      setActiveCustomArea(newArea);

      const src = map.getSource(STUDY_BOX_SOURCE) as maplibregl.GeoJSONSource;
      if (src) {
        src.setData(newArea.geojson as any);
        map.setLayoutProperty(STUDY_BOX_FILL, "visibility", "visible");
        map.setLayoutProperty(STUDY_BOX_LINE, "visibility", "visible");
      }

      onSelectCustomArea?.(newArea);
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [isDefiningStudyArea, onSelectCustomArea]);

  // Toggle study area layer visibility when defining study area
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    if (map.getLayer(STUDY_BOX_FILL) && map.getLayer(STUDY_BOX_LINE)) {
      const visibility = isDefiningStudyArea || activeCustomArea ? "visible" : "none";
      map.setLayoutProperty(STUDY_BOX_FILL, "visibility", visibility);
      map.setLayoutProperty(STUDY_BOX_LINE, "visibility", visibility);
    }
  }, [isDefiningStudyArea, activeCustomArea]);

  // Smooth camera panning when center changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    map.flyTo({
      center: [center[1], center[0]],
      zoom: 13,
      duration: 1000,
    });
  }, [center]);

  // Sync simulation depth image onto map canvas
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !meta || !frameH?.length) return;

    const url = makeFloodImage(frameH);
    if (!url) return;

    const coords = getCoordinates(meta);
    const oldIndex = activeLayerRef.current;
    const nextIndex = oldIndex === 0 ? 1 : 0;

    const source = map.getSource(SOURCE_IDS[nextIndex]) as ImageSource | undefined;
    if (source) {
      source.updateImage({
        url,
        coordinates: coords,
      });
    } else {
      map.addSource(SOURCE_IDS[nextIndex], {
        type: "image",
        url,
        coordinates: coords,
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
        className={`flood-map-canvas ${isDefiningStudyArea ? "cursor-crosshair" : ""}`}
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
          {cursorCoords
            ? `${cursorCoords.lat.toFixed(4)}° N, ${cursorCoords.lng.toFixed(4)}° E`
            : `${center[0].toFixed(4)}° N, ${center[1].toFixed(4)}° E`}
        </div>
        <div className="hud-meta">
          <span>CRS: EPSG:32643</span>
          <span className="dot">•</span>
          <span>GRID: 256×256 @ 10m</span>
          <span className="dot">•</span>
          <span>ZOOM: {mapZoom}x</span>
        </div>
        {activeCustomArea && (
          <div className="custom-area-telemetry">
            <span className="custom-area-tag">CUSTOM STUDY AREA</span>
            <span>2.56 km × 2.56 km • 6.55 km²</span>
          </div>
        )}
      </div>

      {/* Quick Action Map Tools */}
      <div className="map-quick-tools">
        {onToggleDefineArea && (
          <button
            type="button"
            className={`map-tool-btn define-area-btn ${isDefiningStudyArea ? "is-active" : ""}`}
            onClick={onToggleDefineArea}
            title={isDefiningStudyArea ? "Cancel defining area (Click to finish)" : "Define custom 2.5km study area on map"}
            aria-label="Define custom study area"
          >
            <span>{isDefiningStudyArea ? "✕ CANCEL AREA" : "⬚ DEFINE STUDY AREA"}</span>
          </button>
        )}

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

      {/* Define Area Prompt Overlay */}
      {isDefiningStudyArea && (
        <div className="define-area-banner">
          <span className="banner-icon">🎯</span>
          <span>Click anywhere in Bengaluru to place your 2.5km × 2.5km flood simulation study area</span>
        </div>
      )}

      {/* Hydrologic Water Depth Legend */}
      <div className="map-depth-legend" role="region" aria-label="Water Depth Legend">
        <div className="legend-header">
          <LayersIcon width={14} height={14} />
          <span className="legend-title">WATER DEPTH (m)</span>
        </div>

        <div className="legend-list">
          <div className="legend-item">
            <span className="legend-swatch shallow" aria-hidden="true" />
            <span className="legend-range tabular-num">0.01 – 0.15 m</span>
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
