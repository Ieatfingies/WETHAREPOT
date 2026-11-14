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
const INUNDATION_THRESHOLD_M = 0.03;

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
  const [hoveredCell, setHoveredCell] = useState<{
    elevationM: number;
    depthM: number;
    isBuilding: boolean;
  } | null>(null);

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
      pedestal: isDark ? 0x1e211f : 0xd8d0c2,
      gridLine: isDark ? 0x2e332f : 0xc7beae,
      building: isDark ? 0x3f463e : 0x6e766a,
      buildingRoof: isDark ? 0x5a6358 : 0x8a9486,
      ambient: isDark ? 0x505850 : 0x989080,
      directional: isDark ? 0xfffaea : 0xfffaea,
    };
  }, [theme]);

  // Initialize Three.js scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(colors.background);
    scene.fog = new THREE.FogExp2(colors.fog, 0.0018);

    // 2. Camera (Isometric oblique perspective)
    const camera = new THREE.PerspectiveCamera(38, width / height, 1, 2500);
    cameraRef.current = camera;
    camera.position.set(240, 220, 240);

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
    controls.maxPolarAngle = Math.PI / 2.08; // Prevent looking from below ground
    controls.minDistance = 60;
    controls.maxDistance = 650;
    controls.target.set(0, 10, 0);

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(solarState.ambientColor, solarState.ambientIntensity);
    ambientLightRef.current = ambientLight;
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(solarState.sunColor, solarState.sunIntensity);
    sunLight.position.set(...solarState.sunDirection);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 50;
    sunLight.shadow.camera.far = 700;
    sunLight.shadow.camera.left = -160;
    sunLight.shadow.camera.right = 160;
    sunLight.shadow.camera.top = 160;
    sunLight.shadow.camera.bottom = -160;
    sunLight.shadow.bias = -0.0004;
    sunLightRef.current = sunLight;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(
      solarState.isNight ? 0x5a7a9e : 0x8ab9c2,
      solarState.isNight ? 0.6 : 0.45
    );
    rimLight.position.set(-160, 120, -160);
    rimLightRef.current = rimLight;
    scene.add(rimLight);

    // 6. Animation loop
    const clock = new THREE.Clock();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Gentle subtle water sheen pulsation
      if (waterMeshRef.current) {
        const mat = waterMeshRef.current.material as THREE.MeshStandardMaterial;
        mat.roughness = 0.18 + Math.sin(elapsed * 1.5) * 0.04;
      }

      // Rain particle animation loop
      if (rainMeshRef.current && rainPositionsRef.current && showRain) {
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
              d.y = 90 + Math.random() * 35;
            }
            const idx = i * 6;
            pos[idx] = d.x;
            pos[idx + 1] = d.y;
            pos[idx + 2] = d.z;
            pos[idx + 3] = d.x - 0.4;
            pos[idx + 4] = d.y - 4.2;
            pos[idx + 5] = d.z - 0.2;
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

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      controls.dispose();
      renderer.dispose();
      scene.clear();
    };
  }, [colors, solarState, showRain, rainfallMmHr]);

  // Dynamically update Sun, Sky & Ambient Lighting as solar time changes
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

    // Subtle night illumination on building windows
    if (buildingsMeshRef.current) {
      const mat = buildingsMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(solarState.isNight ? 0xcc9944 : 0x000000);
      mat.emissiveIntensity = solarState.isNight ? 0.38 : 0.0;
    }
  }, [solarState]);

  // Build / Update Low-Poly Raindrop Particle System
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (rainMeshRef.current) {
      scene.remove(rainMeshRef.current);
      rainMeshRef.current.geometry.dispose();
      (rainMeshRef.current.material as THREE.Material).dispose();
      rainMeshRef.current = null;
      rainPositionsRef.current = null;
      rainDropDataRef.current = [];
    }

    if (!showRain || rainfallMmHr <= 0) return;

    // Density scaled by rainfall mm/hr (350 for light, 1400 for moderate, 2800 for torrential)
    const count = Math.min(2800, Math.max(350, Math.round(rainfallMmHr * 32)));
    const planeSize = 220;

    const positions = new Float32Array(count * 6); // 2 vertices per segment * 3 coords
    const dropData: { x: number; y: number; z: number; speed: number }[] = [];
    const baseSpeed = 70 + Math.min(75, rainfallMmHr * 0.85);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * planeSize;
      const y = Math.random() * 110;
      const z = (Math.random() - 0.5) * planeSize;
      const speed = baseSpeed + (Math.random() - 0.5) * 20;

      dropData.push({ x, y, z, speed });

      const idx = i * 6;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      positions[idx + 3] = x - 0.4;
      positions[idx + 4] = y - 4.2;
      positions[idx + 5] = z - 0.2;
    }

    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const rainMat = new THREE.LineBasicMaterial({
      color: 0x8cc4d6,
      transparent: true,
      opacity: Math.min(0.68, 0.28 + (rainfallMmHr / 120) * 0.35),
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
  }, [rainfallMmHr, showRain]);

  // Build / Update Terrain & Pedestal Mesh
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !dem || dem.length === 0) return;

    // Remove old terrain mesh
    if (terrainMeshRef.current) {
      scene.remove(terrainMeshRef.current);
      terrainMeshRef.current.geometry.dispose();
      terrainMeshRef.current = null;
    }

    const rows = dem.length;
    const cols = dem[0].length;
    const outRows = Math.floor(rows / STRIDE);
    const outCols = Math.floor(cols / STRIDE);

    const planeSize = 200; // 3D units across the catchment
    const dx = planeSize / (outCols - 1);
    const dz = planeSize / (outRows - 1);
    const elevSpan = Math.max(1, maxElev - minElev);

    // Create low-poly indexed terrain geometry
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colorsArr: number[] = [];
    const indices: number[] = [];

    // Height calculation helper
    const getHeight = (r: number, c: number) => {
      const origR = Math.min(rows - 1, r * STRIDE);
      const origC = Math.min(cols - 1, c * STRIDE);
      const rawElev = dem[origR]?.[origC] ?? minElev;
      return ((rawElev - minElev) / elevSpan) * (18 * verticalExaggeration);
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

    // Add Base Pedestal Box (Museum model plinth)
    const pedestalGeo = new THREE.BoxGeometry(planeSize + 3, 8, planeSize + 3);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: colors.pedestal,
      roughness: 0.95,
      flatShading: true,
    });
    const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestalMesh.position.set(0, -4.5, 0);
    pedestalMesh.receiveShadow = true;
    scene.add(pedestalMesh);

    return () => {
      scene.remove(pedestalMesh);
      pedestalGeo.dispose();
      pedestalMat.dispose();
    };
  }, [dem, minElev, maxElev, verticalExaggeration, theme, colors]);

  // Build / Update 3D Building Blocks (InstancedMesh)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !dem || !buildingMask) return;

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
          const terrainY = ((rawElev - minElev) / elevSpan) * (18 * verticalExaggeration);

          // Realistic variation based on spatial hash (3m to 12m height)
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
    const boxMat = new THREE.MeshStandardMaterial({
      color: colors.building,
      roughness: 0.75,
      metalness: 0.1,
      flatShading: true,
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
  }, [dem, buildingMask, minElev, maxElev, verticalExaggeration, colors]);

  // Build / Dynamically Update 3D Water Surface & Depths
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !dem) return;

    if (waterMeshRef.current) {
      scene.remove(waterMeshRef.current);
      waterMeshRef.current.geometry.dispose();
      waterMeshRef.current = null;
    }

    if (!frameH || frameH.length === 0) return;

    const rows = dem.length;
    const cols = dem[0].length;
    const planeSize = 200;
    const elevSpan = Math.max(1, maxElev - minElev);
    const cellSize = (planeSize / cols) * STRIDE;

    // Collect inundated cells
    const waterCells: {
      x: number;
      y: number;
      z: number;
      depth: number;
    }[] = [];

    for (let r = 0; r < rows; r += STRIDE) {
      for (let c = 0; c < cols; c += STRIDE) {
        const h = frameH[r]?.[c] ?? 0;
        if (h >= INUNDATION_THRESHOLD_M) {
          const x = -planeSize / 2 + (c / cols) * planeSize;
          const z = -planeSize / 2 + (r / rows) * planeSize;
          const rawElev = dem[r]?.[c] ?? minElev;
          const terrainY = ((rawElev - minElev) / elevSpan) * (18 * verticalExaggeration);
          const waterSurfaceY = terrainY + Math.max(0.2, h * verticalExaggeration * 1.5);

          waterCells.push({
            x,
            y: waterSurfaceY,
            z,
            depth: h,
          });
        }
      }
    }

    if (waterCells.length === 0) return;

    // Create instanced low-poly water slabs
    const waterBlockGeo = new THREE.BoxGeometry(cellSize * 0.98, 0.4, cellSize * 0.98);
    const waterMat = new THREE.MeshStandardMaterial({
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.82,
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

      // Depth Color Ramp
      const h = cell.depth;
      if (h < 0.15) {
        color.setRGB(0.54, 0.73, 0.76); // Shallow river cyan
      } else if (h < 0.30) {
        color.setRGB(0.29, 0.56, 0.64); // Moderate river slate
      } else if (h < 0.60) {
        color.setRGB(0.18, 0.37, 0.48); // High hazard river deep
      } else if (h < 1.00) {
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
  }, [dem, frameH, minElev, maxElev, verticalExaggeration]);

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
      cameraRef.current.position.set(240, 220, 240);
      controlsRef.current.target.set(0, 10, 0);
    } else {
      // Direct Top-Down Orthogonal-like angle
      cameraRef.current.position.set(0, 340, 0);
      controlsRef.current.target.set(0, 0, 0);
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
          <strong>3D DIGITAL TWIN • {regionName.toUpperCase()}</strong>
        </div>
        <div className="twin-badge-meta">
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
            <span>0.03 – 0.15m (Sheet)</span>
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
