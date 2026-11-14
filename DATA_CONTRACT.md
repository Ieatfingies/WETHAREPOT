# WETHAREPOT — Standardized Data & Interface Contract (R07)

All modules (`geospatial/`, `simulation/`, `ml/`, `backend/`) must adhere strictly to this specification.

## 1. Spatial & Grid Specification
- **Coordinate Reference System (CRS):** `EPSG:32643` (WGS 84 / UTM Zone 43N — metric coordinates for Bengaluru)
- **Standard Grid Dimensions:** `256 x 256` cells (`128 x 128` allowed for Phase 3 toy validation; powers of 2 required for U-Net)
- **Spatial Resolution ($\Delta x, \Delta y$):** `10.0 m x 10.0 m` per cell (`2.56 km x 2.56 km` patch at `256 x 256`)
- **Array Orientation & Memory Layout:** `float32`, C-contiguous (row-major). Index `[0, 0]` = North-West (top-left).

## 2. Physical Units
- **Elevation ($z$) & Water Depth ($h$):** meters (`m`)
- **Velocity ($u, v$):** meters per second (`m/s`)
- **Rainfall Rate ($R$) & Infiltration ($I$):** meters per second (`m/s`) — convert `mm/hr` via `R_ms = R_mmhr / 3_600_000.0`
- **Manning's Roughness ($n$):** `s / m^(1/3)` (e.g., `0.015` paved roads, `0.035` urban/soil, `0.050` vegetated)
- **Simulation Timestep ($\Delta t$):** seconds (`s`), governed by $\text{CFL} \le 0.45$
- **ML Surrogate Macro-Step ($\Delta T$):** `60.0 s` (or `300.0 s`) per autoregressive step

## 3. Tensor Channel Ordering
### Model / Solver Input Tensor $X_t$ — Shape `(7, H, W)`
| Channel | Symbol | Description | Units |
| :--- | :--- | :--- | :--- |
| `0` | $z$ | Bare-earth DEM elevation | `m` |
| `1` | $M_{\text{bldg}}$ | Binary building obstacle mask (`1` = solid wall, `0` = open) | `{0, 1}` |
| `2` | $n$ | Surface Manning roughness coefficient | `s/m^(1/3)` |
| `3` | $h_t$ | Water depth at time $t$ | `m` |
| `4` | $u_t$ | Depth-averaged $x$-velocity at time $t$ | `m/s` |
| `5` | $v_t$ | Depth-averaged $y$-velocity at time $t$ | `m/s` |
| `6` | $R_t$ | Spatially uniform or gridded rainfall rate | `m/s` |

### Model / Solver Target Tensor $Y_{t+\Delta T}$ — Shape `(3, H, W)`
| Channel | Symbol | Description | Units |
| :--- | :--- | :--- | :--- |
| `0` | $h_{t+\Delta T}$ | Water depth at $t + \Delta T$ | `m` |
| `1` | $u_{t+\Delta T}$ | $x$-velocity at $t + \Delta T$ | `m/s` |
| `2` | $v_{t+\Delta T}$ | $y$-velocity at $t + \Delta T$ | `m/s` |

## 4. Inter-Process Exchange Format
- **C++ Solver ↔ Python / ML:** `.npz` archive containing `dem`, `building_mask`, `roughness`, `h`, `u`, `v`, `rainfall`, and `dt` (plus `meta.json` with bounding box in `EPSG:32643`).