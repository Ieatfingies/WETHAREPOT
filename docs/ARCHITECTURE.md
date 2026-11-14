# WETHAREPOT — System Architecture & Mathematical Specification (R01–R06)

**Project:** WETHAREPOT — Physics-Informed Neural Surrogate for Real-Time Urban Flood Forecasting  
**Problem Statement:** Build Beyond '26 — PS 1.2  
**Target Geography:** Bengaluru, Karnataka, India (`EPSG:32643`)

---

## 1. End-to-End System Architecture (R06)

WETHAREPOT decouples **offline ground-truth physics simulation & model training** from **online interactive inference**, while allowing users to run either engine side-by-side for live verification.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                     FRONTEND: React + TypeScript + MapLibre GL JS          │
│  • Full Bengaluru Map (12 Preset Catchments + Custom Polygon Drawing)      │
│  • Rainfall Intensity (mm/hr), Duration (min), & Engine Toggle             │
│  • 2D Depth Heatmap, 3D Terrain/Building Extrusion, & Speedup Benchmarks   │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ REST / JSON + Binary Grids
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND: Python + FastAPI                        │
│  • /api/gis/prepare   ──► Clips & rasterizes selected region/polygon       │
│  • /api/sim/physics   ──► Executes C++ 2D Shallow-Water Solver             │
│  • /api/sim/surrogate ──► Executes PyTorch Physics-Informed U-Net          │
│  • /api/compare       ──► Computes MAE, RMSE, IoU, Mass Error, & Speedup   │
└───────────────┬─────────────────────────────────────────┬──────────────────┘
                │                                         │
                ▼                                         ▼
┌───────────────────────────────┐         ┌──────────────────────────────────┐
│  ENGINE 1: C++ FVM Solver     │         │  ENGINE 2: PyTorch U-Net         │
│  • 2D Shallow-Water PDEs      │         │  • Residual state prediction     │
│  • Rusanov Riemann Fluxes     │────────►│  • Trained on solver rollouts    │
│  • Hydrostatic Reconstruction │ Dataset │  • Physics-Informed Loss:        │
│  • Adaptive CFL Timestepping  │  (.npz) │    L_data + L_mass + L_nonneg    │
└───────────────────────────────┘         └──────────────────────────────────┘
                ▲                                         ▲
                └────────────────────┬────────────────────┘
                                     │ Standardized (7, H, W) Tensors
                    ┌────────────────┴────────────────┐
                    │   GIS PIPELINE (GDAL/Rasterio)  │
                    │  • Copernicus 30m DEM           │
                    │  • OSM Buildings, Roads, Lakes  │
                    └─────────────────────────────────┘