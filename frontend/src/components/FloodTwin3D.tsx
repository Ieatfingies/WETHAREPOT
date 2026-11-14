import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SimulationMeta } from "../types/simulation";
import { calculateSolarState, type SolarState } from "../utils/solarCalculator";
import {
  CompassRoseIcon,
  ResetIcon,
  LayersIcon,
  Cube3DIcon,
  CloudRainIcon,
} from "./icons/CartographicIcons";

interface FloodTwin3DProps {
  dem: number[][] | null;
  buildingMask: number[][] | null;
  frameH: number[][] | null;
  meta: SimulationMeta | null;
  regionName?: string;
  theme?: "light" | "dark";
  rainfallMmHr?: number;
  timeOfDayHour?: number;
  historicalDate?: Date;
  isHistorical?: boolean;
}

const STRIDE = 2; // Downsample 256x256 to 128x128 for crisp low-poly facets & silky 60fps
const INUNDATION_THRESHOLD_M = 0.005; // 5mm cutoff for crisp shallow flood & lake bed visibility
const CATCHMENT_FLOAT_Y = 8.0; // Selected catchment tile floats up +8.0 units above city ground for simulation

/**
 * Generates a warm, subtle procedural apartment lights texture for evening/night past 5:00 PM :3
 * Very minimal lights: few pinprick windows glowing gently across apartment blocks.
 */
function createApartmentLightsTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Black background so unlit wall surfaces have 0 emissive boost
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 128, 128);

  const rows = 8;
  const cols = 8;
  const winW = 7;
  const winH = 5;
  const padX = 4;
  const padY = 5;

  const warmHues = [
    "#ffe29a", // Cozy incandescent lamp
    "#ffc870", // Warm amber living room
    "#fff3d1", // Soft warm white bedroom
    "#fca311", // Golden balcony glow
    "#ffeaa7", // Soft tungsten
  ];

  let seed = 1337;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Very minimal lights: only ~12% of windows lit past 5 PM :3
      if (rnd() < 0.12) {
        const x = c * 16 + padX;
        const y = r * 16 + padY;
        const color = warmHues[Math.floor(rnd() * warmHues.length)];

        // Soft ambient window halo
        ctx.fillStyle = "rgba(255, 205, 120, 0.20)";
        ctx.fillRect(x - 1, y - 1, winW + 2, winH + 2);

        // Core tiny window light
        ctx.fillStyle = color;
        ctx.fillRect(x, y, winW, winH);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 4);
  return texture;
}

interface BengaluruLake {
  name: string;
  x: number;
  z: number;
  width: number;
  length: number;
  rotation: number;
  elevation: number;
}

const BENGALURU_LAKES: BengaluruLake[] = [
  { name: "Bellandur Lake", x: 180, z: 95, width: 62, length: 38, rotation: -0.22, elevation: -0.4 },
  { name: "Varthur Lake", x: 290, z: 120, width: 56, length: 32, rotation: 0.18, elevation: -0.8 },
  { name: "Hebbal Lake", x: 40, z: -250, width: 48, length: 30, rotation: 0.32, elevation: -0.3 },
  { name: "Nagavara Lake", x: 120, z: -210, width: 36, length: 24, rotation: -0.15, elevation: -0.5 },
  { name: "Yelahanka Lake", x: -20, z: -350, width: 44, length: 28, rotation: 0.12, elevation: -0.2 },
  { name: "Kengeri Lake", x: -260, z: 180, width: 40, length: 26, rotation: -0.25, elevation: -0.7 },
  { name: "Sankey Tank", x: -90, z: -140, width: 26, length: 20, rotation: -0.05, elevation: 0.2 },
  { name: "Madivala Lake", x: 60, z: 190, width: 42, length: 30, rotation: 0.22, elevation: -0.5 },
  { name: "Agara Lake", x: 135, z: 160, width: 34, length: 24, rotation: -0.18, elevation: -0.4 },
  { name: "Ulsoor Lake", x: 75, z: -130, width: 32, length: 24, rotation: 0.15, elevation: 0.0 },
];

/**
 * Procedurally generates expansive low-poly districts across Bengaluru metropolitan domain
 * (Not bound by any pedestal grid; spans naturally across city horizons).
 */
function generateBengaluruCityBlocks(): { x: number; y: number; z: number; width: number; depth: number; height: number }[] {
  const blocks: { x: number; y: number; z: number; width: number; depth: number; height: number }[] = [];
  let seed = 42;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const clusters = [
    // CBD / Vidhana Soudha / MG Road
    { minX: -60, maxX: 60, minZ: -180, maxZ: -110, count: 55, minH: 9, maxH: 26, baseW: 6.5 },
    // Indiranagar & Halasuru
    { minX: 110, maxX: 220, minZ: -70, maxZ: 30, count: 48, minH: 6, maxH: 16, baseW: 5.5 },
    // Koramangala Valley
    { minX: 80, maxX: 200, minZ: 40, maxZ: 140, count: 62, minH: 6, maxH: 18, baseW: 6.0 },
    // Bellandur / Varthur Tech Corridor (Outer Ring Road)
    { minX: 200, maxX: 400, minZ: 20, maxZ: 180, count: 68, minH: 8, maxH: 28, baseW: 7.5 },
    // Whitefield & EPIP Zone
    { minX: 340, maxX: 560, minZ: -80, maxZ: 90, count: 54, minH: 7, maxH: 24, baseW: 7.0 },
    // HSR Layout & Kudlu
    { minX: 60, maxX: 180, minZ: 150, maxZ: 270, count: 50, minH: 5, maxH: 16, baseW: 5.5 },
    // Electronic City Phase 1 & 2
    { minX: 80, maxX: 260, minZ: 310, maxZ: 520, count: 56, minH: 7, maxH: 22, baseW: 7.0 },
    // BTM Layout & JP Nagar
    { minX: -100, maxX: 40, minZ: 170, maxZ: 320, count: 52, minH: 5, maxH: 15, baseW: 5.5 },
    // Jayanagar & Basavanagudi
    { minX: -160, maxX: -40, minZ: 30, maxZ: 170, count: 58, minH: 5, maxH: 14, baseW: 5.0 },
    // Mysore Road / Vrishabhavathi Corridor
    { minX: -360, maxX: -150, minZ: 40, maxZ: 220, count: 54, minH: 4.5, maxH: 13, baseW: 5.5 },
    // Rajajinagar & Vijayanagar
    { minX: -340, maxX: -130, minZ: -130, maxZ: 30, count: 52, minH: 5, maxH: 15, baseW: 5.5 },
    // Yeshwanthpur & Malleshwaram
    { minX: -200, maxX: -50, minZ: -250, maxZ: -110, count: 48, minH: 5.5, maxH: 17, baseW: 6.0 },
    // Peenya Industrial Area
    { minX: -520, maxX: -240, minZ: -210, maxZ: -20, count: 46, minH: 4, maxH: 12, baseW: 7.5 },
    // Hebbal & Manyata Tech Park
    { minX: -40, maxX: 180, minZ: -360, maxZ: -210, count: 55, minH: 7, maxH: 22, baseW: 6.5 },
    // Yelahanka & North Bengaluru
    { minX: -150, maxX: 110, minZ: -540, maxZ: -360, count: 44, minH: 5, maxH: 16, baseW: 6.0 },
  ];

  for (const c of clusters) {
    for (let i = 0; i < c.count; i++) {
      const x = c.minX + rnd() * (c.maxX - c.minX);
      const z = c.minZ + rnd() * (c.maxZ - c.minZ);
      // Exclude center region so the selected catchment tile floats freely above
      if (Math.abs(x) < 108 && Math.abs(z) < 108) continue;

      const height = c.minH + rnd() * (c.maxH - c.minH);
      const width = c.baseW * (0.8 + rnd() * 0.4);
      const depth = c.baseW * (0.8 + rnd() * 0.4);
      const groundY = -1.2 + Math.cos(x * 0.0035) * 3.2 - Math.sin(z * 0.003) * 2.6;

      blocks.push({
        x,
        y: groundY + height / 2,
        z,
        width,
        depth,
        height,
      });
    }
  }

  return blocks;
}

export function FloodTwin3D({
  dem,
  buildingMask,
  frameH,
  meta,
  regionName = "Catchment",
  theme = "light",
  rainfallMmHr = 0,
  timeOfDayHour,
  historicalDate,
  isHistorical = false,
}: FloodTwin3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Mesh & Light references for dynamic updating
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const regionalTerrainMeshRef = useRef<THREE.Mesh | null>(null);
  const cityLakesGroupRef = useRef<THREE.Group | null>(null);
  const cityBuildingsMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const catchmentBoundaryRef = useRef<THREE.LineSegments | null>(null);
  const waterMeshRef = useRef<THREE.Mesh | null>(null);
  const buildingsMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rainMeshRef = useRef<THREE.LineSegments | null>(null);
  const rainPositionsRef = useRef<Float32Array | null>(null);
  const rainDropDataRef = useRef<{ x: number; y: number; z: number; speed: number }[]>([]);

  const [verticalExaggeration, setVerticalExaggeration] = useState<number>(2.0);
  const [showRain, setShowRain] = useState<boolean>(true);
  const [sceneReady, setSceneReady] = useState<boolean>(false);
  const showRainRef = useRef(showRain);
  const rainfallMmHrRef = useRef(rainfallMmHr);

  useEffect(() => {
    showRainRef.current = showRain;
    rainfallMmHrRef.current = rainfallMmHr;
  }, [showRain, rainfallMmHr]);

  const [hoveredCell, setHoveredCell] = useState<{
    elevationM: number;
    depthM: number;
    isBuilding: boolean;
  } | null>(null);

  // Subtle procedural apartment window lights texture for evening/night past 5 PM :3
  const apartmentLightsTexture = useMemo(() => createApartmentLightsTexture(), []);

  // Live fallback date initialized once to preserve React purity
  const [liveDate] = useState(() => new Date());
  const activeDate = historicalDate ?? liveDate;

  // Solar calculation for Bengaluru
  const currentHour =
    timeOfDayHour !== undefined
      ? timeOfDayHour
      : activeDate.getHours() + activeDate.getMinutes() / 60;

  const solarState = useMemo<SolarState>(() => {
    return calculateSolarState(activeDate, currentHour);
  }, [activeDate, currentHour]);

  // Compute elevation bounds
  const { minElev, maxElev } = useMemo(() => {
    if (!dem || dem.length === 0) return { minElev: 800, maxElev: 900 };
    let min = Infinity;
    let max = -Infinity;
    for (let r = 0; r < dem.length; r += STRIDE) {
      const row = dem[r];
      for (let c = 0; c < row.length; c += STRIDE) {
        const val = row[c];
        if (Number.isFinite(val)) {
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
    }
    return {
      minElev: Number.isFinite(min) ? min : 800,
      maxElev: Number.isFinite(max) ? max : 900,
    };
  }, [dem]);

  // Color palette depending on theme
  const colors = useMemo(() => {
    const isDark = theme === "dark";
    return {
      background: isDark ? 0x161817 : 0xece6dc,
      fog: isDark ? 0x161817 : 0xece6dc,
      building: isDark ? 0x3f463e : 0x6e766a,
      buildingRoof: isDark ? 0x5a6358 : 0x8a9486,
      ambient: isDark ? 0x505850 : 0x989080,
      directional: isDark ? 0xfffaea : 0xfffaea,
    };
  }, [theme]);

  // Initialize Three.js scene (Runs ONCE on mount — never torn down on parameter changes)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0xece6dc, 0.0011);

    // 2. Camera (Isometric oblique perspective over unbounded Bengaluru metropolitan area)
    const camera = new THREE.PerspectiveCamera(38, width / height, 1, 4500);
    cameraRef.current = camera;
    camera.position.set(360, 260, 360);

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2.05; // Prevent looking from below ground
    controls.minDistance = 60;
    controls.maxDistance = 1800;
    controls.target.set(0, 12, 0);

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0x9ea298, 1.15);
    ambientLightRef.current = ambientLight;
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffae5, 1.7);
    sunLight.position.set(180, 240, 180);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 50;
    sunLight.shadow.camera.far = 1800;
    sunLight.shadow.camera.left = -450;
    sunLight.shadow.camera.right = 450;
    sunLight.shadow.camera.top = 450;
    sunLight.shadow.camera.bottom = -450;
    sunLight.shadow.bias = -0.0004;
    sunLightRef.current = sunLight;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x8ab9c2, 0.45);
    rimLight.position.set(-180, 140, -180);
    rimLightRef.current = rimLight;
    scene.add(rimLight);

    // 6. Animation loop
    const clock = new THREE.Clock();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Gentle water sheen pulsation
      if (waterMeshRef.current) {
        const mat = waterMeshRef.current.material as THREE.MeshStandardMaterial;
        mat.roughness = 0.16 + Math.sin(elapsed * 1.5) * 0.04;
      }

      // Dynamic city lakes filling & pulsation during rain / simulation
      if (cityLakesGroupRef.current) {
        const rainSurge = Math.min(2.5, (rainfallMmHrRef.current / 40.0) * 1.5);
        cityLakesGroupRef.current.children.forEach((child, idx) => {
          if (child instanceof THREE.Mesh) {
            const lake = BENGALURU_LAKES[idx % BENGALURU_LAKES.length];
            child.position.y = lake.elevation + rainSurge * 0.6 + Math.sin(elapsed * 1.4 + idx) * 0.04;
            child.scale.set(1, 1 + rainSurge * 1.8, lake.length / lake.width);
            if (child.material) {
              (child.material as THREE.MeshStandardMaterial).roughness = 0.15 + Math.sin(elapsed * 1.2) * 0.03;
            }
          }
        });
      }

      // Rain particle animation loop (falls across expansive 1400-unit metropolitan domain)
      if (rainMeshRef.current && rainPositionsRef.current && showRainRef.current && rainfallMmHrRef.current > 0) {
        const pos = rainPositionsRef.current;
        const dropData = rainDropDataRef.current;
        const count = dropData.length;

        // Respect prefers-reduced-motion
        const prefersReducedMotion =
          typeof window !== "undefined" &&
          window.matchMedia &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (!prefersReducedMotion) {
          for (let i = 0; i < count; i++) {
            const d = dropData[i];
            d.y -= d.speed * delta;
            if (d.y < -5) {
              d.y = 125 + Math.random() * 40;
            }
            const idx = i * 6;
            pos[idx] = d.x;
            pos[idx + 1] = d.y;
            pos[idx + 2] = d.z;
            pos[idx + 3] = d.x - 0.45;
            pos[idx + 4] = d.y - 4.5;
            pos[idx + 5] = d.z - 0.25;
          }
          const attr = rainMeshRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
          attr.needsUpdate = true;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // 7. Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    setSceneReady(true);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      controls.dispose();
      renderer.dispose();
      scene.clear();
      sceneRef.current = null;
      setSceneReady(false);
    };
  }, []);

  // Dynamically update Sun, Sky & Ambient Lighting as solar time changes, plus minimal apartment lights past 5:00 PM :3
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (sunLightRef.current) {
      sunLightRef.current.position.set(...solarState.sunDirection);
      sunLightRef.current.color.setHex(solarState.sunColor);
      sunLightRef.current.intensity = solarState.sunIntensity;
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.color.setHex(solarState.ambientColor);
      ambientLightRef.current.intensity = solarState.ambientIntensity;
    }
    if (rimLightRef.current) {
      rimLightRef.current.color.setHex(solarState.isNight ? 0x5a7a9e : 0x8ab9c2);
      rimLightRef.current.intensity = solarState.isNight ? 0.6 : 0.45;
    }

    scene.background = new THREE.Color(solarState.backgroundColor);
    if (scene.fog) {
      scene.fog.color.setHex(solarState.fogColor);
    }

    // Minimal Cozy Apartment Lights past 5:00 PM (17:00 IST) :3
    const isPast5PMOrNight = currentHour >= 17.0 || currentHour < 6.0 || solarState.isNight;
    const windowGlowIntensity = isPast5PMOrNight ? 0.55 : 0.0;

    if (buildingsMeshRef.current) {
      const mat = buildingsMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(0xffdf88);
      mat.emissiveMap = isPast5PMOrNight ? apartmentLightsTexture : null;
      mat.emissiveIntensity = windowGlowIntensity;
      mat.needsUpdate = true;
    }
    if (cityBuildingsMeshRef.current) {
      const mat = cityBuildingsMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(0xffdf88);
      mat.emissiveMap = isPast5PMOrNight ? apartmentLightsTexture : null;
      mat.emissiveIntensity = isPast5PMOrNight ? 0.50 : 0.0;
      mat.needsUpdate = true;
    }
  }, [solarState, currentHour, apartmentLightsTexture]);

  // Build / Update Low-Poly Raindrop Particle System across expansive Bengaluru domain
  useEffect(() => {
    const scene = sceneRef.current;
    if (!sceneReady || !scene) return;

    if (rainMeshRef.current) {
      scene.remove(rainMeshRef.current);
      rainMeshRef.current.geometry.dispose();
      (rainMeshRef.current.material as THREE.Material).dispose();
      rainMeshRef.current = null;
      rainPositionsRef.current = null;
      rainDropDataRef.current = [];
    }

    if (!showRain || rainfallMmHr <= 0) return;

    // Density scaled by rainfall mm/hr across whole unbounded Bengaluru metropolitan span (1400 units)
    const count = Math.min(4200, Math.max(600, Math.round(rainfallMmHr * 45)));
    const planeSize = 1400;

    const positions = new Float32Array(count * 6); // 2 vertices per segment * 3 coords
    const dropData: { x: number; y: number; z: number; speed: number }[] = [];
    const baseSpeed = 75 + Math.min(80, rainfallMmHr * 0.9);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * planeSize;
      const y = Math.random() * 140;
      const z = (Math.random() - 0.5) * planeSize;
      const speed = baseSpeed + (Math.random() - 0.5) * 20;

      dropData.push({ x, y, z, speed });

      const idx = i * 6;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      positions[idx + 3] = x - 0.45;
      positions[idx + 4] = y - 4.5;
      positions[idx + 5] = z - 0.25;
    }

    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const rainMat = new THREE.LineBasicMaterial({
      color: 0x8cc4d6,
      transparent: true,
      opacity: Math.min(0.7, 0.3 + (rainfallMmHr / 120) * 0.35),
      blending: THREE.AdditiveBlending,
    });

    const rainLines = new THREE.LineSegments(rainGeo, rainMat);
    scene.add(rainLines);
    rainMeshRef.current = rainLines;
    rainPositionsRef.current = positions;
    rainDropDataRef.current = dropData;

    return () => {
      scene.remove(rainLines);
      rainGeo.dispose();
      rainMat.dispose();
    };
  }, [sceneReady, rainfallMmHr, showRain]);

  // Build / Update Floating Catchment Terrain & Unbounded Regional Bengaluru Topography
  useEffect(() => {
    const scene = sceneRef.current;
    if (!sceneReady || !scene || !dem || dem.length === 0) return;

    // Remove old terrain & city meshes
    if (terrainMeshRef.current) {
      scene.remove(terrainMeshRef.current);
      terrainMeshRef.current.geometry.dispose();
      terrainMeshRef.current = null;
    }
    if (regionalTerrainMeshRef.current) {
      scene.remove(regionalTerrainMeshRef.current);
      regionalTerrainMeshRef.current.geometry.dispose();
      regionalTerrainMeshRef.current = null;
    }
    if (catchmentBoundaryRef.current) {
      scene.remove(catchmentBoundaryRef.current);
      catchmentBoundaryRef.current.geometry.dispose();
      catchmentBoundaryRef.current = null;
    }
    if (cityLakesGroupRef.current) {
      scene.remove(cityLakesGroupRef.current);
      cityLakesGroupRef.current.children.forEach((c) => {
        if (c instanceof THREE.Mesh) {
          c.geometry.dispose();
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
      cityLakesGroupRef.current = null;
    }
    if (cityBuildingsMeshRef.current) {
      scene.remove(cityBuildingsMeshRef.current);
      cityBuildingsMeshRef.current.geometry.dispose();
      cityBuildingsMeshRef.current = null;
    }

    const rows = dem.length;
    const cols = dem[0].length;
    const outRows = Math.floor(rows / STRIDE);
    const outCols = Math.floor(cols / STRIDE);

    const planeSize = 200; // 3D units across the active catchment
    const dx = planeSize / (outCols - 1);
    const dz = planeSize / (outRows - 1);
    const elevSpan = Math.max(1, maxElev - minElev);

    // 1. Create floating low-poly indexed terrain geometry for active catchment (elevated at CATCHMENT_FLOAT_Y)
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colorsArr: number[] = [];
    const indices: number[] = [];

    // Height calculation helper (Selected catchment floats above base city)
    const getHeight = (r: number, c: number) => {
      const origR = Math.min(rows - 1, r * STRIDE);
      const origC = Math.min(cols - 1, c * STRIDE);
      const rawElev = dem[origR]?.[origC] ?? minElev;
      return CATCHMENT_FLOAT_Y + ((rawElev - minElev) / elevSpan) * (18 * verticalExaggeration);
    };

    // Low-poly terrain tint ramp
    const isDark = theme === "dark";
    const lowColor = new THREE.Color(isDark ? 0x242823 : 0xbaa992);
    const midColor = new THREE.Color(isDark ? 0x2f362e : 0xd3c6b2);
    const highColor = new THREE.Color(isDark ? 0x3d463b : 0xe5dcce);

    for (let r = 0; r < outRows; r++) {
      const z = -planeSize / 2 + r * dz;
      for (let c = 0; c < outCols; c++) {
        const x = -planeSize / 2 + c * dx;
        const y = getHeight(r, c);

        positions.push(x, y, z);

        // Normalized elevation color
        const normY = (dem[r * STRIDE]?.[c * STRIDE] ?? minElev - minElev) / elevSpan;
        const vertexColor = new THREE.Color();
        if (normY < 0.45) {
          vertexColor.lerpColors(lowColor, midColor, normY / 0.45);
        } else {
          vertexColor.lerpColors(midColor, highColor, (normY - 0.45) / 0.55);
        }
        colorsArr.push(vertexColor.r, vertexColor.g, vertexColor.b);
      }
    }

    // Two triangles per grid cell for low-poly facets
    for (let r = 0; r < outRows - 1; r++) {
      for (let c = 0; c < outCols - 1; c++) {
        const i0 = r * outCols + c;
        const i1 = r * outCols + (c + 1);
        const i2 = (r + 1) * outCols + c;
        const i3 = (r + 1) * outCols + (c + 1);

        indices.push(i0, i2, i1);
        indices.push(i1, i2, i3);
      }
    }

    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colorsArr, 3));
    geometry.computeVertexNormals();

    const terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.88,
      metalness: 0.05,
    });

    const terrainMesh = new THREE.Mesh(geometry, terrainMaterial);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;

    // 2. Expansive Unbounded Regional Bengaluru Deccan Plateau (2200 x 2200 units, NO bounding pedestal box)
    const regionalSpan = 2200;
    const regionalSegments = 96;
    const regGeo = new THREE.PlaneGeometry(regionalSpan, regionalSpan, regionalSegments, regionalSegments);
    regGeo.rotateX(-Math.PI / 2);

    const regPos = regGeo.attributes.position;
    const regColors: number[] = [];
    const regLowColor = new THREE.Color(isDark ? 0x1f2320 : 0xb5a58e);
    const regMidColor = new THREE.Color(isDark ? 0x272d26 : 0xc7bba7);
    const regHighColor = new THREE.Color(isDark ? 0x323a31 : 0xdcd3c3);

    for (let i = 0; i < regPos.count; i++) {
      const vx = regPos.getX(i);
      const vz = regPos.getZ(i);

      // Natural undulating Deccan topography extending to the horizon
      const vy = -1.2 + Math.cos(vx * 0.0035) * 3.2 - Math.sin(vz * 0.003) * 2.6;
      regPos.setY(i, vy);

      const normY = (vy + 5) / 10;
      const c = new THREE.Color();
      if (normY < 0.5) {
        c.lerpColors(regLowColor, regMidColor, Math.max(0, Math.min(1, normY / 0.5)));
      } else {
        c.lerpColors(regMidColor, regHighColor, Math.max(0, Math.min(1, (normY - 0.5) / 0.5)));
      }
      regColors.push(c.r, c.g, c.b);
    }

    regGeo.setAttribute("color", new THREE.Float32BufferAttribute(regColors, 3));
    regGeo.computeVertexNormals();

    const regMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.92,
      metalness: 0.04,
    });

    const regMesh = new THREE.Mesh(regGeo, regMat);
    regMesh.receiveShadow = true;
    scene.add(regMesh);
    regionalTerrainMeshRef.current = regMesh;

    // 3. Floating Holographic Neatline Boundary & Elevation Pillars for Selected Catchment
    const boundHalf = 100.5;
    const boundY = CATCHMENT_FLOAT_Y + 0.2;
    const boundaryPositions = new Float32Array([
      // Floating perimeter ring
      -boundHalf, boundY, -boundHalf,  boundHalf, boundY, -boundHalf,
       boundHalf, boundY, -boundHalf,  boundHalf, boundY,  boundHalf,
       boundHalf, boundY,  boundHalf, -boundHalf, boundY,  boundHalf,
      -boundHalf, boundY,  boundHalf, -boundHalf, boundY, -boundHalf,

      // Bracket corner ticks
      -boundHalf, boundY, -boundHalf, -boundHalf + 14, boundY, -boundHalf,
      -boundHalf, boundY, -boundHalf, -boundHalf, boundY, -boundHalf + 14,
       boundHalf, boundY, -boundHalf,  boundHalf - 14, boundY, -boundHalf,
       boundHalf, boundY, -boundHalf,  boundHalf, boundY, -boundHalf + 14,
       boundHalf, boundY,  boundHalf,  boundHalf - 14, boundY,  boundHalf,
       boundHalf, boundY,  boundHalf,  boundHalf, boundY,  boundHalf - 14,
      -boundHalf, boundY,  boundHalf, -boundHalf + 14, boundY,  boundHalf,
      -boundHalf, boundY,  boundHalf, -boundHalf, boundY,  boundHalf - 14,

      // Vertical guide pillars dropping to base city plane showing the floating selection
      -boundHalf, 0, -boundHalf, -boundHalf, boundY, -boundHalf,
       boundHalf, 0, -boundHalf,  boundHalf, boundY, -boundHalf,
       boundHalf, 0,  boundHalf,  boundHalf, boundY,  boundHalf,
      -boundHalf, 0,  boundHalf, -boundHalf, boundY,  boundHalf,
    ]);

    const boundGeo = new THREE.BufferGeometry();
    boundGeo.setAttribute("position", new THREE.BufferAttribute(boundaryPositions, 3));
    const boundMat = new THREE.LineBasicMaterial({
      color: isDark ? 0xd48756 : 0xaa5c32, // Terracotta cartographic boundary
      transparent: true,
      opacity: 0.85,
    });
    const boundLines = new THREE.LineSegments(boundGeo, boundMat);
    scene.add(boundLines);
    catchmentBoundaryRef.current = boundLines;

    // 4. Bengaluru Major Cascading Lakes
    const lakesGroup = new THREE.Group();
    const lakeWaterMat = new THREE.MeshStandardMaterial({
      color: 0x36657a, // River blue / slate cyan
      roughness: 0.16,
      metalness: 0.15,
      transparent: true,
      opacity: 0.88,
      flatShading: true,
    });

    for (const lake of BENGALURU_LAKES) {
      const lakeGeo = new THREE.CylinderGeometry(lake.width / 2, (lake.width / 2) * 0.9, 0.4, 8);
      lakeGeo.scale(1, 1, lake.length / lake.width);
      const lakeMesh = new THREE.Mesh(lakeGeo, lakeWaterMat);
      lakeMesh.position.set(lake.x, lake.elevation, lake.z);
      lakeMesh.rotation.y = lake.rotation;
      lakeMesh.receiveShadow = true;
      lakesGroup.add(lakeMesh);
    }
    scene.add(lakesGroup);
    cityLakesGroupRef.current = lakesGroup;

    // 5. Expansive Surrounding Bengaluru Districts (InstancedMesh with subtle apartment lights past 5 PM :3)
    const cityBlocks = generateBengaluruCityBlocks();
    if (cityBlocks.length > 0) {
      const cBoxGeo = new THREE.BoxGeometry(1, 1, 1);
      const isPast5PM = currentHour >= 17.0 || currentHour < 6.0 || solarState.isNight;
      const cBoxMat = new THREE.MeshStandardMaterial({
        color: colors.building,
        roughness: 0.78,
        metalness: 0.08,
        flatShading: true,
        emissive: new THREE.Color(0xffdf88),
        emissiveMap: isPast5PM ? apartmentLightsTexture : null,
        emissiveIntensity: isPast5PM ? 0.50 : 0.0,
      });

      const cInstMesh = new THREE.InstancedMesh(cBoxGeo, cBoxMat, cityBlocks.length);
      cInstMesh.castShadow = true;
      cInstMesh.receiveShadow = true;

      const cDummy = new THREE.Object3D();
      cityBlocks.forEach((b, idx) => {
        cDummy.position.set(b.x, b.y, b.z);
        cDummy.scale.set(b.width, b.height, b.depth);
        cDummy.updateMatrix();
        cInstMesh.setMatrixAt(idx, cDummy.matrix);
      });

      cInstMesh.instanceMatrix.needsUpdate = true;
      scene.add(cInstMesh);
      cityBuildingsMeshRef.current = cInstMesh;
    }

    return () => {
      if (terrainMeshRef.current) {
        scene.remove(terrainMeshRef.current);
        terrainMeshRef.current.geometry.dispose();
        terrainMeshRef.current = null;
      }
      if (regionalTerrainMeshRef.current) {
        scene.remove(regionalTerrainMeshRef.current);
        regionalTerrainMeshRef.current.geometry.dispose();
        regionalTerrainMeshRef.current = null;
      }
      if (catchmentBoundaryRef.current) {
        scene.remove(catchmentBoundaryRef.current);
        catchmentBoundaryRef.current.geometry.dispose();
        catchmentBoundaryRef.current = null;
      }
      if (cityLakesGroupRef.current) {
        scene.remove(cityLakesGroupRef.current);
        cityLakesGroupRef.current.children.forEach((c) => {
          if (c instanceof THREE.Mesh) c.geometry.dispose();
        });
        cityLakesGroupRef.current = null;
      }
      if (cityBuildingsMeshRef.current) {
        scene.remove(cityBuildingsMeshRef.current);
        cityBuildingsMeshRef.current.geometry.dispose();
        cityBuildingsMeshRef.current = null;
      }
    };
  }, [sceneReady, dem, minElev, maxElev, verticalExaggeration, theme, colors, currentHour, solarState, apartmentLightsTexture]);

  // Build / Update Floating Catchment Building Blocks
  useEffect(() => {
    const scene = sceneRef.current;
    if (!sceneReady || !scene || !dem || !buildingMask) return;

    if (buildingsMeshRef.current) {
      scene.remove(buildingsMeshRef.current);
      buildingsMeshRef.current.geometry.dispose();
      buildingsMeshRef.current = null;
    }

    const rows = dem.length;
    const cols = dem[0].length;
    const planeSize = 200;
    const elevSpan = Math.max(1, maxElev - minElev);

    // Identify building block cells
    const buildingInstances: { x: number; y: number; z: number; scaleY: number }[] = [];

    for (let r = 0; r < rows; r += STRIDE) {
      for (let c = 0; c < cols; c += STRIDE) {
        if ((buildingMask[r]?.[c] ?? 0) > 0) {
          const x = -planeSize / 2 + (c / cols) * planeSize;
          const z = -planeSize / 2 + (r / rows) * planeSize;
          const rawElev = dem[r]?.[c] ?? minElev;
          const terrainY = CATCHMENT_FLOAT_Y + ((rawElev - minElev) / elevSpan) * (18 * verticalExaggeration);

          // Realistic variation based on spatial hash (3.5m to 12m height)
          const hash = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453;
          const bldgHeight = 3.5 + (Math.abs(hash) % 8.5);

          buildingInstances.push({
            x,
            y: terrainY + bldgHeight / 2,
            z,
            scaleY: bldgHeight,
          });
        }
      }
    }

    if (buildingInstances.length === 0) return;

    const blockSize = (planeSize / cols) * STRIDE * 0.92;
    const boxGeo = new THREE.BoxGeometry(blockSize, 1, blockSize);
    const isPast5PM = currentHour >= 17.0 || currentHour < 6.0 || solarState.isNight;
    const boxMat = new THREE.MeshStandardMaterial({
      color: colors.building,
      roughness: 0.75,
      metalness: 0.1,
      flatShading: true,
      emissive: new THREE.Color(0xffdf88),
      emissiveMap: isPast5PM ? apartmentLightsTexture : null,
      emissiveIntensity: isPast5PM ? 0.55 : 0.0,
    });

    const instancedMesh = new THREE.InstancedMesh(boxGeo, boxMat, buildingInstances.length);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();

    buildingInstances.forEach((inst, i) => {
      dummy.position.set(inst.x, inst.y, inst.z);
      dummy.scale.set(1, inst.scaleY, 1);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    scene.add(instancedMesh);
    buildingsMeshRef.current = instancedMesh;
  }, [sceneReady, dem, buildingMask, minElev, maxElev, verticalExaggeration, colors, currentHour, solarState, apartmentLightsTexture]);

  // Build / Dynamically Update Floating Catchment Water Surface, Depths & Lake Bed Filling
  useEffect(() => {
    const scene = sceneRef.current;
    if (!sceneReady || !scene || !dem) return;

    if (waterMeshRef.current) {
      scene.remove(waterMeshRef.current);
      waterMeshRef.current.geometry.dispose();
      waterMeshRef.current = null;
    }

    const rows = dem.length;
    const cols = dem[0].length;
    const planeSize = 200;
    const elevSpan = Math.max(1, maxElev - minElev);
    const cellSize = (planeSize / cols) * STRIDE;

    // Collect inundated cells and dynamic lake bed filling
    const waterCells: {
      x: number;
      y: number;
      z: number;
      depth: number;
    }[] = [];

    for (let r = 0; r < rows; r += STRIDE) {
      for (let c = 0; c < cols; c += STRIDE) {
        const h = frameH?.[r]?.[c] ?? 0;
        const rawElev = dem[r]?.[c] ?? minElev;
        const normElev = (rawElev - minElev) / elevSpan;
        const isLakeBasin = normElev < 0.14; // Low-lying natural lake depression

        // Render water if inundated from simulation OR if within lake depression during rain/sim
        if (h >= INUNDATION_THRESHOLD_M || (isLakeBasin && (h > 0 || rainfallMmHrRef.current > 0))) {
          const x = -planeSize / 2 + (c / cols) * planeSize;
          const z = -planeSize / 2 + (r / rows) * planeSize;
          const terrainY = CATCHMENT_FLOAT_Y + normElev * (18 * verticalExaggeration);

          // Lake water naturally fills the basin depression and swells with flood depth
          const lakeBaselineDepth = isLakeBasin ? Math.max(0.18, (0.14 - normElev) * 10.0 * verticalExaggeration) : 0;
          const effectiveDepth = Math.max(h, lakeBaselineDepth + h * 1.5);
          const waterSurfaceY = terrainY + Math.max(0.18, effectiveDepth * verticalExaggeration * 1.15);

          waterCells.push({
            x,
            y: waterSurfaceY,
            z,
            depth: effectiveDepth,
          });
        }
      }
    }

    if (waterCells.length === 0) return;

    // Create instanced low-poly water slabs
    const waterBlockGeo = new THREE.BoxGeometry(cellSize * 0.98, 0.35, cellSize * 0.98);
    const waterMat = new THREE.MeshStandardMaterial({
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
      flatShading: true,
    });

    const waterInstanced = new THREE.InstancedMesh(waterBlockGeo, waterMat, waterCells.length);
    waterInstanced.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    waterCells.forEach((cell, i) => {
      dummy.position.set(cell.x, cell.y, cell.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      waterInstanced.setMatrixAt(i, dummy.matrix);

      // Depth Color Ramp: Clear turquoise shallow -> deep river slate -> terracotta clay flood
      const d = cell.depth;
      if (d < 0.15) {
        color.setRGB(0.52, 0.74, 0.78); // Shallow river cyan
      } else if (d < 0.30) {
        color.setRGB(0.28, 0.56, 0.65); // Moderate river slate
      } else if (d < 0.60) {
        color.setRGB(0.18, 0.37, 0.48); // High hazard river ink
      } else if (d < 1.00) {
        color.setRGB(0.71, 0.45, 0.32); // Severe hazard terracotta
      } else {
        color.setRGB(0.58, 0.27, 0.22); // Critical clay red
      }
      waterInstanced.setColorAt(i, color);
    });

    waterInstanced.instanceMatrix.needsUpdate = true;
    if (waterInstanced.instanceColor) waterInstanced.instanceColor.needsUpdate = true;

    scene.add(waterInstanced);
    waterMeshRef.current = waterInstanced as unknown as THREE.Mesh;
  }, [sceneReady, dem, frameH, minElev, maxElev, verticalExaggeration]);

  // Raycasting cell inspection on mouse move
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!mountRef.current || !cameraRef.current || !terrainMeshRef.current || !dem) return;

      const rect = mountRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);

      const intersects = raycaster.intersectObject(terrainMeshRef.current);
      if (intersects.length > 0) {
        const point = intersects[0].point;
        const planeSize = 200;
        const normX = (point.x + planeSize / 2) / planeSize;
        const normZ = (point.z + planeSize / 2) / planeSize;

        const col = Math.floor(normX * dem[0].length);
        const row = Math.floor(normZ * dem.length);

        if (row >= 0 && row < dem.length && col >= 0 && col < dem[0].length) {
          const elev = dem[row]?.[col] ?? minElev;
          const depth = frameH?.[row]?.[col] ?? 0;
          const isBldg = (buildingMask?.[row]?.[col] ?? 0) > 0;

          setHoveredCell({
            elevationM: Math.round(elev * 10) / 10,
            depthM: Math.round(depth * 100) / 100,
            isBuilding: isBldg,
          });
        }
      } else {
        setHoveredCell(null);
      }
    },
    [dem, frameH, buildingMask, minElev]
  );

  const resetCamera = useCallback((isometric = true) => {
    if (!cameraRef.current || !controlsRef.current) return;
    if (isometric) {
      cameraRef.current.position.set(360, 260, 360);
      controlsRef.current.target.set(0, 12, 0);
    } else {
      // Direct Top-Down Orthogonal-like angle
      cameraRef.current.position.set(0, 520, 0);
      controlsRef.current.target.set(0, 12, 0);
    }
    controlsRef.current.update();
  }, []);

  return (
    <div
      className="flood-twin-3d-container"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoveredCell(null)}
      role="region"
      aria-label="3D Low-Poly Digital Twin Visualization"
    >
      {/* Three.js Canvas Mount */}
      <div ref={mountRef} className="twin-3d-viewport" />

      {/* Cartographic Frame Border & Neatlines */}
      <div className="twin-neatline-overlay" aria-hidden="true">
        <div className="frame-corner top-left" />
        <div className="frame-corner top-right" />
        <div className="frame-corner bottom-left" />
        <div className="frame-corner bottom-right" />
      </div>

      {/* Top Left Spatial Telemetry HUD */}
      <div className="twin-hud-badge">
        <div className="twin-badge-title">
          <Cube3DIcon width={15} height={15} />
          <strong>3D DIGITAL TWIN • BENGALURU METROPOLITAN REGION</strong>
        </div>
        <div className="twin-badge-meta">
          <span>ACTIVE CATCHMENT: {regionName.toUpperCase()} (ELEVATED)</span>
          <span className="dot">•</span>
          <span>ELEV: {minElev.toFixed(0)}m – {maxElev.toFixed(0)}m MSL</span>
          <span className="dot">•</span>
          <span>RES: {meta?.resolution_m ?? 10}m FVM GRID</span>
          <span className="dot">•</span>
          <span className="solar-phase-tag">
            SOLAR: {solarState.phase.replace("_", " ").toUpperCase()} ({solarState.elevationDeg > 0 ? "+" : ""}{solarState.elevationDeg}°)
          </span>
        </div>

        {isHistorical && (
          <div className="historical-replay-pill">
            <span className="replay-dot" />
            <strong>HISTORICAL REPLAY</strong>
            <span>
              {activeDate.toLocaleDateString("en-IN", {
                month: "short",
                day: "numeric",
              })}{" "}
              {Math.floor(currentHour).toString().padStart(2, "0")}:
              {Math.floor((currentHour % 1) * 60).toString().padStart(2, "0")}{" "}
              IST (PAUSED)
            </span>
          </div>
        )}

        {hoveredCell && (
          <div className="twin-cell-inspection">
            <div>
              <span>SURFACE Z:</span> <strong>{hoveredCell.elevationM} m</strong>
            </div>
            {hoveredCell.depthM >= INUNDATION_THRESHOLD_M && (
              <div>
                <span>WATER DEPTH:</span>{" "}
                <strong className="depth-highlight">{hoveredCell.depthM} m</strong>
              </div>
            )}
            {hoveredCell.isBuilding && (
              <div className="bldg-tag">STRUCTURAL FOOTPRINT</div>
            )}
          </div>
        )}
      </div>

      {/* Camera & Exaggeration Controls */}
      <div className="twin-toolbar">
        <button
          type="button"
          className="twin-tool-btn"
          onClick={() => resetCamera(true)}
          title="Reset Isometric Camera"
          aria-label="Reset Isometric Camera"
        >
          <ResetIcon width={14} height={14} />
          <span>ISO</span>
        </button>

        <button
          type="button"
          className="twin-tool-btn"
          onClick={() => resetCamera(false)}
          title="Top-Down Plan View"
          aria-label="Top-Down Plan View"
        >
          <CompassRoseIcon width={14} height={14} />
          <span>TOP</span>
        </button>

        <button
          type="button"
          className={`twin-tool-btn ${showRain && rainfallMmHr > 0 ? "is-active" : ""}`}
          onClick={() => setShowRain(!showRain)}
          title={`Low-Poly Rain: ${showRain ? "Enabled" : "Disabled"} (${rainfallMmHr} mm/hr)`}
          aria-label="Toggle Low-Poly Raindrop Particles"
        >
          <CloudRainIcon width={14} height={14} />
          <span>RAIN {showRain && rainfallMmHr > 0 ? "ON" : "OFF"}</span>
        </button>

        <div className="exaggeration-toggle-group">
          <span className="exagg-label">Z-RELIEF:</span>
          {[1.0, 2.0, 3.5].map((factor) => (
            <button
              key={factor}
              type="button"
              className={`exagg-btn ${verticalExaggeration === factor ? "is-active" : ""}`}
              onClick={() => setVerticalExaggeration(factor)}
              title={`${factor}x Vertical Exaggeration`}
            >
              {factor}x
            </button>
          ))}
        </div>
      </div>

      {/* 3D Depth Legend */}
      <div className="twin-depth-legend">
        <div className="legend-header">
          <LayersIcon width={13} height={13} />
          <span>WATER COLUMN (m)</span>
        </div>
        <div className="legend-items">
          <div className="legend-row">
            <span className="swatch c-shallow" />
            <span>0.01 – 0.15m (Sheet)</span>
          </div>
          <div className="legend-row">
            <span className="swatch c-mod" />
            <span>0.15 – 0.30m (Curb)</span>
          </div>
          <div className="legend-row">
            <span className="swatch c-high" />
            <span>0.30 – 0.60m (Road Impassable)</span>
          </div>
          <div className="legend-row">
            <span className="swatch c-severe" />
            <span>0.60 – 1.00m (Structural Ingress)</span>
          </div>
          <div className="legend-row">
            <span className="swatch c-extreme" />
            <span>&gt; 1.00m (Critical Depth)</span>
          </div>
        </div>
      </div>

      {/* Graceful State: Before Simulation Run */}
      {(!frameH || frameH.length === 0) && (
        <div className="twin-dry-prompt">
          <div className="dry-prompt-card">
            <Cube3DIcon width={24} height={24} />
            <h4>Dry Terrain Topology</h4>
            <p>
              Showing Copernicus 30m DEM & OpenStreetMap building block extrusions.
              Execute simulation to model dynamic flood propagation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
