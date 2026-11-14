# System Architecture

## 1. Overview

WETHAREPOT is an urban flood forecasting system designed to simulate and predict flood conditions using geospatial data, numerical simulation, and a machine-learning surrogate model.

The system is divided into five major components:

1. **Frontend** – Provides the user interface for interacting with the flood forecasting system.
2. **Backend** – Coordinates requests, manages simulation execution, and returns results through API endpoints.
3. **Geospatial Pipeline** – Acquires and processes terrain and urban geographic data.
4. **Physics Simulation** – Uses a shallow-water-equation-based solver to simulate flood propagation.
5. **Machine Learning Surrogate** – Uses a U-Net model to estimate flood states with the goal of reducing prediction time.

## 2. High-Level Architecture

The system follows this general workflow:

```text
                    USER
                     |
                     v
              REACT FRONTEND
                     |
                     v
                FASTAPI
                     |
          +----------+----------+
          |                     |
          v                     v
   PHYSICS RUNNER        SURROGATE RUNNER
          |                     |
          v                     v
    C++ FLOOD SOLVER       PYTORCH U-NET
          |                     |
          +----------+----------+
                     |
                     v
              ANALYTICS SERVICE
                     |
                     v
                API RESPONSE
                     |
                     v
                 FRONTEND
```

The geospatial pipeline prepares the terrain and urban input data required by the simulation.

## 3. Frontend

**Location:** `frontend/`

The frontend is responsible for presenting flood information and allowing users to interact with the system.

Main technologies:

- React
- TypeScript
- Vite

Important files:

| File | Responsibility |
|---|---|
| `src/App.tsx` | Main application component |
| `src/App.css` | Application-specific styling |
| `src/index.css` | Global styling |
| `src/main.tsx` | Frontend entry point |
| `vite.config.ts` | Vite configuration |

The frontend communicates with the backend through HTTP API requests.

## 4. Backend

**Location:** `backend/`

The backend acts as the central coordinator of the application. It receives requests from the frontend, invokes the appropriate processing services, and returns results.

Important files:

| File | Responsibility |
|---|---|
| `main.py` | FastAPI application entry point |
| `api/routes.py` | API route definitions |
| `core/config.py` | Configuration settings |
| `core/schemas.py` | Request and response schemas |
| `services/physics_runner.py` | Runs the physics-based solver |
| `services/surrogate_runner.py` | Runs the ML surrogate |
| `services/analytics.py` | Processes simulation output |

### API endpoints

The implemented routes include:

- `GET /api/health` – Checks backend availability.
- `GET /api/regions` – Returns available regions.
- `POST /api/simulate` – Starts a flood simulation request.

## 5. Geospatial Pipeline

**Location:** `geospatial/`

The geospatial pipeline prepares geographic information for flood simulation.

Its main responsibilities include:

- Acquiring elevation data.
- Retrieving relevant OpenStreetMap features.
- Preparing building masks.
- Generating terrain grids.
- Assigning surface roughness values.
- Saving processed geographic data.

Important files:

| File | Responsibility |
|---|---|
| `acquisition/regions.py` | Defines geographic regions |
| `grid_generation/builder.py` | Builds simulation grids |
| `test_gis.py` | Tests geospatial functionality |

The project uses EPSG:32643 (WGS 84 / UTM zone 43N) as its working coordinate reference system.

The standard simulation grid is 256 × 256 cells, with a resolution of 10 metres per cell.

## 6. Physics Simulation

**Location:** `simulation/`

The physics simulation component models the movement of floodwater over terrain.

It uses a shallow-water-equation-based numerical solver.

Important files:

| File | Responsibility |
|---|---|
| `core/FloodState.hpp` | Represents flood state data |
| `core/ShallowWaterSolver.hpp` | Solver interface |
| `core/ShallowWaterSolver.cpp` | Numerical solver implementation |
| `core/config.hpp` | Simulation configuration |
| `core/main_cli.cpp` | Command-line entry point |
| `render/GLWrappers.hpp` | Rendering-related wrappers |
| `render/RenderContext.hpp` | Rendering context |
| `shaders/water.vert` | Water vertex shader |
| `shaders/water.frag` | Water fragment shader |
| `run_bellandur_test.py` | Bellandur simulation test |

The solver includes numerical techniques such as:

- Rusanov numerical flux.
- Hydrostatic reconstruction.
- CFL-controlled time stepping.
- Manning friction.
- Rainfall forcing.

The solver produces time-dependent flood state outputs, including water depth and velocity components.

## 7. Machine Learning Surrogate

**Location:** `ml/`

The machine-learning component uses a U-Net architecture to predict future flood states from terrain and current simulation conditions.

The intended purpose is to provide a faster alternative to repeatedly running the full numerical solver.

Important files:

| File | Responsibility |
|---|---|
| `models/unet.py` | U-Net architecture |
| `training/dataset.py` | Dataset loading and normalization |
| `training/dataset_generator.py` | Generates training data |
| `training/train.py` | Model training |
| `losses/physics_loss.py` | Training loss function |
| `inference/predict.py` | Surrogate inference |
| `weights/unet_flood.pth` | Trained model checkpoint |

The model uses seven input channels:

1. Digital Elevation Model (DEM)
2. Building mask
3. Surface roughness
4. Water depth
5. X-direction velocity
6. Y-direction velocity
7. Rainfall

It predicts three output channels:

1. Next water depth
2. Next X-direction velocity
3. Next Y-direction velocity

The current implementation is a preliminary surrogate prototype. Its loss includes a data-fitting term and a penalty for negative predicted water depth; it does not yet implement a complete shallow-water PDE residual or mass-conservation constraint.

## 8. Data Flow

The overall data flow is:

1. Geographic input data is acquired and processed by the geospatial pipeline.
2. Terrain and urban features are converted into structured simulation grids.
3. The physics solver uses these grids to simulate flood behaviour.
4. Simulation states can be used to generate machine-learning training samples.
5. The U-Net is trained using the generated dataset.
6. During inference, the surrogate predicts future flood states.
7. The backend processes the results and prepares analytics.
8. The frontend receives and presents the results.

## 9. Data Contract

The project uses a shared data contract to define grid dimensions, coordinate systems, units, and input/output channel layouts.

Refer to the root-level `DATA_CONTRACT.md` for the detailed specification.

The contract is intended to maintain consistency between the geospatial pipeline, physics solver, and machine-learning components.

## 10. Current Implementation Notes

The following points describe the current prototype rather than completed production functionality:

- The physics solver and ML surrogate are separate execution paths.
- The ML model has been trained using generated simulation data.
- The training dataset includes a held-out Koramangala test region.
- The surrogate has passed a basic inference smoke test.
- The ML model's held-out evaluation results indicate that further training and validation are required.
- The geospatial pipeline and simulation components use different intermediate data formats in parts of the current implementation. Their integration should be checked against `DATA_CONTRACT.md`.

## 11. Future Improvements

Potential improvements include:

- Integrating the physics solver and ML surrogate into a consistent end-to-end workflow.
- Improving the accuracy of the surrogate on unseen geographic regions.
- Adding PDE residual and mass-conservation constraints to the training objective.
- Improving training data coverage across rainfall conditions.
- Establishing standardized data exchange between C++ and Python.
- Evaluating inference speed against the physics solver.
- Improving visualization and real-time result delivery.

---

**Project:** WETHAREPOT  
**Document:** System Architecture  
**Purpose:** Describe the major components, responsibilities, and data flow of the system.