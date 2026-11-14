import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

maplibregl.setWorkerUrl(maplibreWorkerUrl);
import type { ImageSource, Map } from "maplibre-gl";
import type { SimulationMeta } from "../types/simulation";
import "maplibre-gl/dist/maplibre-gl.css";

interface FloodMapProps {
  center: [number, number];
  meta: SimulationMeta | null;
  frameH: number[][] | null;
  buildingMask: number[][] | null;
}

function makeFloodImage(grid: number[][]): string {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context || width === 0 || height === 0) return "";

  const image = context.createImageData(width, height);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const depth = Number(grid[row]?.[col] ?? 0);
      const index = (row * width + col) * 4;

      if (!Number.isFinite(depth) || depth <= 0.03) {
        image.data[index + 3] = 0;
        continue;
      }

      let color: [number, number, number];
      if (depth < 0.15) color = [91, 190, 220];
      else if (depth < 0.3) color = [37, 157, 211];
      else if (depth < 0.6) color = [31, 105, 205];
      else if (depth < 1) color = [104, 75, 190];
      else color = [222, 76, 91];

      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = Math.min(220, 105 + Math.round(depth * 85));
    }
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export function FloodMap({ center, meta, frameH, buildingMask }: FloodMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const mapReadyRef = useRef(false);
  const latestPropsRef = useRef({ meta, frameH });

  latestPropsRef.current = { meta, frameH };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [center[1], center[0]],
      zoom: 11,
      minZoom: 9,
      maxZoom: 18,
      attributionControl: {},
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm-base", type: "raster", source: "osm" }],
      },
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      mapReadyRef.current = true;
      map.resize();

      const latest = latestPropsRef.current;
      if (latest.meta && latest.frameH?.length) {
        const [west, south, east, north] = latest.meta.bounds_wgs84;
        const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
          [west, north],
          [east, north],
          [east, south],
          [west, south],
        ];

        const url = makeFloodImage(latest.frameH);
        if (url) {
          map.addSource("flood-depth", {
            type: "image",
            url,
            coordinates,
          });
          map.addLayer({
            id: "flood-depth-layer",
            type: "raster",
            source: "flood-depth",
            paint: { "raster-opacity": 0.78, "raster-fade-duration": 150 },
          });
        }
      }
    });

    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // Map is initialized once; subsequent center changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.easeTo({ center: [center[1], center[0]], duration: 700 });
  }, [center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !meta || !frameH?.length) return;

    const [west, south, east, north] = meta.bounds_wgs84;
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ];

    const url = makeFloodImage(frameH);
    if (!url) return;

    const existing = map.getSource("flood-depth") as ImageSource | undefined;
    if (existing) {
      existing.updateImage({ url, coordinates });
    } else {
      map.addSource("flood-depth", { type: "image", url, coordinates });
      map.addLayer({
        id: "flood-depth-layer",
        type: "raster",
        source: "flood-depth",
        paint: { "raster-opacity": 0.78, "raster-fade-duration": 150 },
      });
    }
  }, [meta, frameH]);

  return (
    <div className="flood-map-wrap">
      <div ref={containerRef} className="flood-map" />
      <div className="map-overlay map-title">
        <span className="live-dot" />
        <span> BENGALURU · FLOOD MONITOR</span>
      </div>
      <div className="map-overlay map-legend">
        <div className="legend-title">WATER DEPTH</div>
        <div className="legend-row"><i className="legend-swatch shallow" />0.03–0.15 m</div>
        <div className="legend-row"><i className="legend-swatch moderate" />0.15–0.30 m</div>
        <div className="legend-row"><i className="legend-swatch high" />0.30–0.60 m</div>
        <div className="legend-row"><i className="legend-swatch severe" />0.60–1.00 m</div>
        <div className="legend-row"><i className="legend-swatch extreme" />&gt;1.00 m</div>
      </div>
      {buildingMask && (
        <div className="map-overlay map-grid-note">
          Building mask loaded · {buildingMask.length} rows
        </div>
      )}
      {!meta && (
        <div className="map-empty-state">
          <div className="map-empty-icon">⌁</div>
          <strong>Ready to simulate</strong>
          <span>Configure a rainfall event and run the model to view flood depth</span>
        </div>
      )}
    </div>
  );
}
