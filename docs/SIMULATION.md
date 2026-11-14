# Physics Simulation Documentation

## 1. Overview

The physics simulation component of WETHAREPOT models the movement and propagation of floodwater over urban terrain.

It uses a C++ implementation of a shallow-water-equation-based numerical solver.

The solver takes terrain information, surface characteristics, and rainfall conditions as inputs. It then calculates the evolution of water depth and velocity over time.

The physics solver provides the numerical simulation component of the project and can also generate data for training and evaluating the machine-learning surrogate.

## 2. Directory Structure

**Location:** `simulation/`

```text
simulation/
├── core/
│   ├── FloodState.hpp
│   ├── ShallowWaterSolver.cpp
│   ├── ShallowWaterSolver.hpp
│   ├── config.hpp
│   └── main_cli.cpp
├── render/
│   ├── GLWrappers.hpp
│   └── RenderContext.hpp
├── shaders/
│   ├── water.frag
│   └── water.vert
└── run_bellandur_test.py
```

| File | Responsibility |
|---|---|
| `FloodState.hpp` | Defines flood state representation |
| `ShallowWaterSolver.hpp` | Declares the solver interface |
| `ShallowWaterSolver.cpp` | Implements the numerical solver |
| `config.hpp` | Stores simulation configuration |
| `main_cli.cpp` | Provides the command-line interface |
| `GLWrappers.hpp` | Contains rendering-related wrappers |
| `RenderContext.hpp` | Handles rendering context |
| `water.vert` | Water vertex shader |
| `water.frag` | Water fragment shader |
| `run_bellandur_test.py` | Runs a Bellandur simulation test |

## 3. Shallow Water Equations

The solver is based on the shallow water equations, which describe the movement of water across a surface.

The model considers:

- Water depth.
- Water flow in the X direction.
- Water flow in the Y direction.
- Terrain elevation.
- Rainfall input.
- Frictional resistance.

The simulation represents the flood state using water depth and velocity components over a two-dimensional grid.

The governing equations account for the conservation of water mass and momentum.

## 4. Flood State Representation

The simulation uses a structured representation of the flood state.

The main physical quantities are:

| Quantity | Symbol | Unit |
|---|---|---|
| Water depth | h | metres |
| X-direction velocity | u | metres/second |
| Y-direction velocity | v | metres/second |
| Terrain elevation | DEM | metres |
| Rainfall intensity | R | metres/second internally |

The terrain elevation and water depth together determine the water surface elevation.

## 5. Numerical Solver

**Implementation:** `core/ShallowWaterSolver.cpp`

The numerical solver updates the flood state over successive time steps.

The implementation includes several numerical techniques.

### 5.1 Finite-Volume Style Updates

The solver uses finite-volume-style numerical updates to calculate changes in the flood state across grid cells.

The approach uses fluxes between neighbouring cells to represent the movement of water.

### 5.2 Rusanov Numerical Flux

The solver uses Rusanov numerical fluxes to calculate the exchange of water and momentum across cell interfaces.

This method provides a numerical approximation of the flux between neighbouring grid cells.

### 5.3 Hydrostatic Reconstruction

Hydrostatic reconstruction is used to account for variations in terrain elevation when calculating fluxes.

It helps represent the influence of uneven terrain on water movement.

### 5.4 Manning Friction

The solver includes Manning friction to represent resistance to water flow.

The Manning roughness coefficient depends on the surface characteristics.

The configured default roughness value is 0.035.

### 5.5 Rainfall Forcing

Rainfall is included as an external input to the simulation.

The rainfall intensity is supplied in millimetres per hour and converted internally to metres per second.

The conversion is:

\[
R_{\text{m/s}} =
\frac{R_{\text{mm/hr}}}{3,600,000}
\]

## 6. Time-Stepping and Stability

The solver uses CFL-controlled time stepping.

The Courant–Friedrichs–Lewy (CFL) condition helps control the simulation time step to maintain numerical stability.

The configured CFL coefficient is 0.45.

The solver configuration also includes:

| Parameter | Default value |
|---|---:|
| Grid size | 256 × 256 |
| Grid spacing | 10 m |
| Gravitational acceleration | 9.81 m/s² |
| CFL coefficient | 0.45 |
| Dry-depth threshold | 0.0001 m |
| Manning roughness | 0.035 |
| Maximum time step | 1 second |
| Open boundaries | Enabled |

The solver calculates time steps according to the stability requirements and configured limits.

## 7. Boundary Conditions

The simulation configuration supports open boundaries.

Boundary conditions determine how water behaves when it reaches the edges of the computational grid.

The boundary configuration is important because the simulated region represents only a limited geographic area rather than an entire drainage basin.

## 8. Command-Line Interface

**File:** `core/main_cli.cpp`

The C++ solver can be executed through its command-line interface.

The expected argument structure is:

```bash
swe_solver <input_dir> <output_dir> <grid_size> <dx_m> <rain_mmhr> <duration_s> [save_interval_s]
```

| Argument | Description |
|---|---|
| `input_dir` | Directory containing simulation input files |
| `output_dir` | Directory for generated output |
| `grid_size` | Grid dimension |
| `dx_m` | Grid spacing in metres |
| `rain_mmhr` | Rainfall intensity in millimetres per hour |
| `duration_s` | Simulation duration in seconds |
| `save_interval_s` | Optional output interval in seconds |

### Input files

The solver expects raw binary grid files:

```text
dem.bin
mask.bin
rough.bin
```

These represent:

- Terrain elevation.
- Building mask.
- Surface roughness.

### Output files

The solver generates time-dependent binary output files for:

```text
frame_*_h.bin
frame_*_u.bin
frame_*_v.bin
```

These represent:

- Water depth.
- X-direction velocity.
- Y-direction velocity.

The output frames allow the flood state to be examined at different points during the simulation.

## 9. Bellandur Test

**File:** `run_bellandur_test.py`

The project includes a Bellandur simulation test.

Bellandur is one of the geographic regions used in the project.

The test script provides a way to exercise the simulation workflow for this region.

## 10. Relationship with the ML Surrogate

The physics solver is important to the machine-learning component because it provides simulated flood behaviour that can be used to construct training samples.

The dataset generator uses simulation data to create input and target arrays for the U-Net.

The ML model is intended to approximate future flood states without repeatedly executing the full numerical solver.

The physics solver therefore serves as the numerical simulation component against which surrogate predictions can be evaluated.

## 11. Current Limitations and Considerations

The solver is part of a developing prototype.

Important considerations include:

- Numerical stability depends on suitable time-step selection.
- Terrain and roughness inputs must be correctly aligned.
- Grid dimensions must match the input files.
- Rainfall units must be converted correctly.
- Boundary conditions influence the resulting flood behaviour.
- The raw binary interface must remain consistent with the Python components.
- Solver predictions should be validated against suitable reference data.

## 12. Future Improvements

Potential improvements include:

- More extensive numerical validation.
- Testing across different geographic regions.
- Additional rainfall scenarios.
- Improved boundary-condition handling.
- Performance optimization for larger grids.
- Better integration with the geospatial pipeline.
- More systematic comparison between physics-based and ML predictions.

---

**Project:** WETHAREPOT  
**Document:** Physics Simulation Documentation  
**Purpose:** Describe the numerical solver, physical quantities, numerical methods, configuration, and execution interface.