# WETHAREPOT — Master Implementation Progress & Checkpoint

**Project**: WETHAREPOT — Real-Time Urban Flood Forecasting Digital Twin for Bengaluru  
**Branch**: `main`  
**Last Updated**: 2026-11-16T12:25:00+05:30  
**Status**: ACTIVE — Solver job lifecycle, historical flood archive, and measured performance work are in progress

---

## 1. Executive Status Dashboard

| Category | Status | Notes |
| :--- | :--- | :--- |
| **Branch & Version Control** | `main` | Production deployment branch connected to Render & Vercel. |
| **Frontend Foundation** | COMPLETE | React 19 + TypeScript + Vite + MapLibre GL + Three.js. 0 oxlint warnings, clean 1.25s build. |
| **Citywide Navigation (A)** | COMPLETE | Search any Bengaluru locality/road/lake (Nominatim OSM), live lat/lon HUD, custom 2.5km study box. |
| **3D Digital Twin (B)** | COMPLETE | Stable Three.js scene (zero chunk teardown on user action), permanent lake beds with depth surge, evening apartment lights. |
| **Fast Simulation (C)** | PARTIAL | Warm inference and uncompressed persistence remain; terrain arrays are cached, result grids use a binary gzip endpoint, and simulations submit as persisted jobs. |
| **Benchmark Testing (D)** | PARTIAL | Matched 128²/256² baseline and candidate frames are identical; unused output bytes fell 66.7%. Single-pass wall times are noisy and show no solver speedup claim. 384² and RSS/CPU profiling remain open. |
| **Retro-Terminal UI (E)** | COMPLETE | Dark retro-terminal aesthetic, single orange accent (`#ff6b00`), Inter/Roboto/Playfair/Libre fonts, top command dock. |
| **Installable PWA (F)** | COMPLETE | `manifest.webmanifest`, offline/shell caching `sw.js`, standalone mobile & desktop support. |
| **Cloud Deployments (G)** | READY | Render (`wetharepot.onrender.com`) & Vercel (`wetharepot.vercel.app`). |

---

## 2. Strict Development Boundaries & Preserved Work

> [!IMPORTANT]
> **UNTOUCHED SCIENTIFIC SOLVER CORE**:
> - `simulation/core/ShallowWaterSolver.cpp` & `.hpp` (C++ SWE solver PDEs, finite-volume numerical fluxes, and physical scheme untouched)
> - `geospatial/acquisition/` (Raw DEM processing and Copernicus 30m grid definitions untouched)
> - `ml/` (Trained neural weights `wetharepot_surrogate_final.pth` untouched)
> All implementations strictly respect developer boundaries while accelerating inference speed and enhancing visualization fidelity.

---

## 3. Implemented Features Checklist

### Milestone 1: Base Platform & 3D Digital Twin Integration
- [x] Portaled, search-enabled accessible `CatchmentCombobox` without layout clipping.
- [x] Cleaned header and telemetry labels (`"Urban Flood Intelligence • Bengaluru"`, `"C++ SWE SOLVER: ONLINE"`, `"GRID: 256×256 @ 10m"`).
- [x] Three.js low-poly 3D Digital Twin with Copernicus 30m DEM flat-shading, OSM building blocks, and flood depth color-coding.
- [x] Frame-synchronized flood analytics (`floodAnalytics.ts`).
- [x] Persistent simulation runs (`backend/core/db.py`, `RunHistoryDrawer.tsx`, `001_create_simulation_runs.sql`).
- [x] Instant pre-simulation terrain stream (`GET /api/terrain/{region_id}`).

### Milestone 2: Low-Poly Raindrop Particle System & Visual Weather
- [x] Three.js stylized low-poly raindrop particle system using GPU-friendly angled line segments.
- [x] Particle density dynamically bound to configured simulation rain ($0-120\text{ mm/hr}$) and live observed rainfall.
- [x] Fall speed and wind angle smoothly animated with boundary recycling.
- [x] Rain toggle button (`RAIN ON/OFF`) in the 3D HUD controls.
- [x] Compliant with `prefers-reduced-motion` to disable particle animation when requested.

### Milestone 3: Operating Mode Split: Simulation Lab vs. Live City Monitor
- [x] Global Mode Switcher in top toolbar: `Mode A (Simulation Lab)` vs `Mode B (Live City Monitor)`.
- [x] `LiveCitySidebar.tsx` displaying real-time atmosphere, 24h precipitation forecast sparkline, and provenance metadata.
- [x] High-resolution live weather ingestion (`backend/services/live_weather.py`) via Open-Meteo Reanalysis API.
- [x] Catchment flood risk assessment engine ranking all 12 Bengaluru catchments by localized drainage stress.

### Milestone 4: Historical Time Travel & Day/Night Solar Simulation
- [x] Solar astronomical calculator (`frontend/src/utils/solarCalculator.ts`) tailored for Bengaluru coordinates ($12.9716^\circ\text{ N}, 77.5946^\circ\text{ E}$).
- [x] Real-time solar lighting across Dawn, Broad Daylight, Golden Hour, Twilight, and Night.
- [x] Subtle warm building window illumination during night cycles and past 5:00 PM IST :3.
- [x] `TimeTravelController.tsx` with date picker, time slider, play/pause, step backward/forward ($15\text{m}$), playback speed ($1\times, 5\times, 30\times, 60\times$), and "Return to Live".

### Milestone 5: Citywide Navigation, Locality Search & Study Area Definition (Section A)
- [x] `CitySearchBox.tsx`: OpenStreetMap Nominatim geocoding bounded to Bengaluru metropolitan domain (`[77.40, 13.25, 77.85, 12.75]`), debounced (350ms) with in-memory caching.
- [x] Instant zero-latency curated directory for major landmarks, lakes, and tech corridors (Bellandur, Varthur, Hebbal, Koramangala, Indiranagar, Electronic City, Whitefield, etc.).
- [x] Live Cursor & Map Center Lat/Lon Telemetry HUD (`12.9716° N, 77.5946° E • ZOOM 13.0 • GRID: 256×256 @ 10m`).
- [x] "DEFINE STUDY AREA" Tool: Click-to-place standard 2.56km × 2.56km (6.55 km²) custom flood study box with metric boundary dimensions and GeoJSON polygon generation.
- [x] Direct connection of custom study geometry (`custom_geojson`) into the simulation pipeline.

### Milestone 6: Geographically Accurate 3D Digital Twin Stability & Lakes (Section B)
- [x] Fixed terrain disappearing bug: Decoupled regional environment (ground, lakes, city blocks) from active catchment effects so scene geometry is never destroyed on interaction or simulation run.
- [x] Permanent lake beds: Natural lake basin depressions (Bellandur Lake, Varthur Lake, Hebbal, Ulsoor, etc.) always render water table that dynamically swells and deepens during rainfall and simulation.
- [x] Minimal glowing apartment lights past 5:00 PM without triggering geometry teardowns.
- [x] Removed DRY TERRAIN TOPOLOGY placeholder completely.

### Milestone 7: Fast Flood Simulation & Solver Acceleration (Section C & D)
- [x] Neural Surrogate pre-warming on backend startup lifespan eliminating 15s cold-start latency.
- [x] `torch.inference_mode()` and `torch.set_num_threads(2)` eliminating CPU thread contention.
- [x] Uncompressed `np.savez` storage replacing slow zlib `np.savez_compressed`.
- [x] Zero-overhead response serialization in `backend/core/schemas.py` eliminating Pydantic quadratic float validation.
- [x] Measured benchmark: Neural Surrogate **1.8s** rollout, SWE Physics **21.6s**, JSON response serialization **<30ms**.

### Milestone 8: Dark Retro-Terminal Redesign (Section E)
- [x] Removed light mode; enforced pure dark retro-terminal theme (`#0b0d0c`).
- [x] Orange is the single prominent accent color (`#ff6b00` / `#ff8533`).
- [x] Imported Google Fonts: Inter, Roboto, Playfair Display, Libre Baskerville, JetBrains Mono.
- [x] Streamlined top command dock (`.terminal-topbar`) replacing large 410px sidebar with accessible slide-over drawer on demand.

### Milestone 9: Progressive Web App (PWA) (Section F)
- [x] Web App Manifest (`manifest.webmanifest`) with standalone display mode and theme color `#0b0d0c`.
- [x] Service Worker (`sw.js`) caching app shell and static assets while bypassing live/simulation API endpoints.
- [x] Service worker registration in `frontend/src/main.tsx`.

---

## 4. Verification Benchmarks

> Historical values below are retained from the previous progress record and were not independently reproduced in this task. See [docs/PERFORMANCE_AND_HISTORY.md](docs/PERFORMANCE_AND_HISTORY.md) for matched measurements, raw artifacts, and limits.

| Metric | Measured Baseline | Measured Post-Optimization | Improvement |
| :--- | :--- | :--- | :--- |
| **Surrogate Rollout (30m)** | 16.39s (with load) | **1.82s** (warm) | **~9x faster** |
| **C++ SWE Solver (30m)** | 21.68s | **21.43s** | Stable FVM physics |
| **Response Serialization** | 8.5s - 14.0s (Pydantic float walk) | **0.028s** | **>300x faster** |
| **Storage Save** | 3.5s (`savez_compressed`) | **0.15s** (`savez`) | **~23x faster** |
| **Frontend Production Build**| 7.05s | **1.25s** | Clean zero warnings |
| **Code Quality (oxlint)** | 0 warnings | **0 warnings, 0 errors** across 28 files | 100% compliant |

---

## 5. Solver Optimization & Past Flood Events (2026-11-16)

### Implemented
- [x] `/api/simulate` returns a run ID; a one-worker default executor records queued → preparing → running → post-processing → completed/failed stages in SQLite.
- [x] Added lightweight run status polling, atomic active-request deduplication, visible stage progress in Simulation History, and persisted failure detail. Interrupted jobs are marked failed at next process startup. No false solver-step percentages are shown.
- [x] Added 8-entry in-memory terrain array cache, removed redundant float32 cast allocations on solver file writes, and capped OpenMP/MKL threads through `SOLVER_OMP_THREADS` (default 2).
- [x] Added gzip-compressed row-major binary result retrieval for the frontend; existing JSON result endpoint remains for compatibility.
- [x] C++ CLI now writes only depth frames. Baseline/candidate matched-frame benchmark measured exactly 0 m max/mean difference and 1.0 flood-extent IoU on 20 frames across 128² and 256² grids at 5/15/30 minutes.
- [x] Added source-linked Past Flood Events route, separate from Simulation History. It labels the RMSI analysis as modeled, reported localities as non-polygon evidence, and official vulnerable locations as context. Historical reconstruction is disabled until valid rainfall/time-matched geodata are available.
- [x] Frontend production build succeeded with Bun; Vite reports a large bundle warning (1.99 MB minified, 536 KB gzip).

### Not complete
- [ ] Replace the in-process executor with a durable external broker if jobs must continue through process loss or scale across multiple workers.
- [ ] Add safe solver cancellation and actual intra-solver step progress.
- [ ] Run repeated benchmark rounds and collect peak memory, CPU utilization, API result-fetch latency, full response serialization, and matched ResUNet/physics timings.
- [ ] Add a 384² matched benchmark; external OSM acquisition stalled during the attempted setup.
- [ ] No defensible event-specific inundation polygons or satellite-derived extents are currently published; the explorer intentionally shows locality names as reports only.
- [ ] No shallow-water equations, CFL rule, boundary conditions, physical parameters, or model architecture were changed.
- [ ] Verify the linked NIDM and CAG PDFs in an accessible source environment; their hosts timed out/redirected during this review. The interface makes no specific claims from those two documents.
- [ ] Rebuild and deploy the production container to include the updated C++ CLI and Python job/result API.
