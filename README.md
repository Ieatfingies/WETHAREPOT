# WETHAREPOT
### Physics-Informed Neural Surrogate for Real-Time Urban Flood Forecasting

WETHAREPOT is an urban flood forecasting prototype that combines geospatial data processing, physics-based flood simulation, and machine learning to model flood propagation across urban environments.

The project explores the use of a machine-learning surrogate to approximate flood simulation results more efficiently than repeatedly executing a numerical physics solver.

The system integrates a C++ shallow-water-equation solver, a Python-based geospatial pipeline, a PyTorch U-Net model, and a React frontend coordinated through a FastAPI backend.

---

## Project Objectives

- Model urban flood propagation using terrain and rainfall information.
- Incorporate geographic features such as elevation, buildings, and surface roughness.
- Implement a numerical flood simulation using shallow-water equations.
- Generate simulation data for machine-learning training.
- Develop a U-Net-based surrogate to predict future flood states.
- Build an integrated application for requesting and presenting flood simulations.

## System Architecture

The project consists of five major components:

| Component | Technology | Responsibility |
|---|---|---|
| Frontend | React, TypeScript, Vite | User interface |
| Backend | Python, FastAPI | API and execution coordination |
| Geospatial pipeline | Python, GIS libraries | Geographic data acquisition and grid generation |
| Physics simulation | C++ | Numerical flood simulation |
| ML surrogate | PyTorch, U-Net | Flood-state prediction |

### High-Level Workflow

```text
             GEOGRAPHIC DATA
                    |
                    v
            GEOSPATIAL PIPELINE
                    |
                    v
             TERRAIN GRIDS
                    |
                    v
          C++ PHYSICS SIMULATOR
                    |
                    v
            SIMULATION DATA
                    |
                    v
             U-NET TRAINING
                    |
                    v
            ML SURROGATE
                    |
                    v
              FASTAPI
                    |
                    v
             REACT FRONTEND
```

The physics solver and machine-learning surrogate are separate execution paths coordinated by the backend.

## Key Components

### 1. Geospatial Processing

The geospatial pipeline prepares geographic information for flood simulation.

It uses:

- Copernicus Digital Elevation Model data.
- OpenStreetMap features.
- Building masks.
- Surface roughness information.
- Raster grid generation.

The project uses EPSG:32643 (WGS 84 / UTM zone 43N) as its working coordinate reference system.

Standard grid configuration:

| Parameter | Value |
|---|---:|
| Grid dimensions | 256 × 256 |
| Spatial resolution | 10 metres |
| Geographic patch | 2.56 km × 2.56 km |

### 2. Physics-Based Simulation

The physics simulation is implemented in C++ using a shallow-water-equation-based numerical solver.

The implementation includes:

- Rusanov numerical fluxes.
- Hydrostatic reconstruction.
- CFL-controlled time stepping.
- Manning friction.
- Rainfall forcing.

The solver models water depth and velocity across a two-dimensional grid.

### 3. Machine-Learning Surrogate

The ML component uses a U-Net convolutional neural network implemented in PyTorch.

The model accepts seven input channels:

1. Digital Elevation Model.
2. Building mask.
3. Surface roughness.
4. Current water depth.
5. X-direction velocity.
6. Y-direction velocity.
7. Rainfall.

It predicts three output channels:

1. Next water depth.
2. Next X-direction velocity.
3. Next Y-direction velocity.

The current prototype uses a data-fitting loss combined with a penalty for negative predicted water depth.

It does not yet implement the complete shallow-water PDE residual or explicit mass-conservation constraints.

### 4. Backend

The FastAPI backend coordinates the system's execution paths.

Implemented API endpoints include:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend health check |
| GET | `/api/regions` | Available geographic regions |
| POST | `/api/simulate` | Simulation request |

### 5. Frontend

The frontend is built using React, TypeScript, and Vite.

It provides the user-facing application and communicates with the backend through HTTP requests.

---

## Machine-Learning Dataset

The prototype dataset was generated using simulated flood scenarios.

### Geographic regions

Training and validation regions:

- Bellandur
- HSR Layout
- Mahadevapura
- Whitefield

Held-out test region:

- Koramangala

### Rainfall scenarios

| Scenario | Rainfall |
|---|---:|
| 1 | 30 mm/hr |
| 2 | 60 mm/hr |
| 3 | 95 mm/hr |
| 4 | 130 mm/hr |

### Dataset distribution

| Split | Samples |
|---|---:|
| Training | 450 |
| Validation | 30 |
| Held-out test | 120 |
| **Total** | **600** |

The generated dataset is stored separately and is not included in the Git repository.

## Preliminary ML Results

The U-Net prototype was trained for 20 epochs using AdamW, with a batch size of 4 and Apple MPS acceleration.

| Metric | Result |
|---|---:|
| Best validation loss | 0.0012734 |
| Best checkpoint epoch | 4 |
| Training loss, epoch 1 | 0.109290 |
| Training loss, epoch 20 | 0.047962 |

### Held-out Koramangala evaluation

| Metric | Result |
|---|---:|
| MAE | 0.116595 m |
| RMSE | 0.545832 m |
| Mean actual depth | 0.024619 m |
| Mean predicted depth | 0.124956 m |

The current model overpredicts water depth on the held-out test data.

It also performs worse than a zero-depth baseline on the reported evaluation metrics.

These results are preliminary and indicate that further model development, training, and validation are necessary before the surrogate can be considered reliable for flood forecasting.

## Repository Structure

```text
WETHAREPOT/
│
├── backend/
│   ├── api/
│   ├── core/
│   ├── services/
│   └── main.py
│
├── frontend/
│   └── src/
│
├── geospatial/
│   ├── acquisition/
│   ├── grid_generation/
│   └── test_gis.py
│
├── simulation/
│   ├── core/
│   ├── render/
│   ├── shaders/
│   └── run_bellandur_test.py
│
├── ml/
│   ├── inference/
│   ├── losses/
│   ├── models/
│   ├── training/
│   └── weights/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── BACKEND.md
│   ├── GEOSPATIAL.md
│   ├── SIMULATION.md
│   ├── ML_PROTOTYPE.md
│   └── DEVELOPMENT.md
│
├── build/
├── DATA_CONTRACT.md
└── README.md
```

## Getting Started

### Prerequisites

- Python 3
- C++ compiler
- Bun
- Node.js
- Git

### 1. Clone the repository

```bash
git clone https://github.com/Ieatfingies/WETHAREPOT.git
cd WETHAREPOT
```

### 2. Set up Python

Create a virtual environment:

```bash
python3 -m venv .venv
```

Activate it:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install numpy scipy rasterio osmnx geopandas shapely pyproj requests matplotlib torch fastapi uvicorn pydantic
```

### 3. Start the backend

From the repository root:

```bash
python -m uvicorn backend.main:app --reload --port 8000
```

Backend address:

```text
http://127.0.0.1:8000
```

### 4. Start the frontend

Open another terminal:

```bash
cd frontend
bun install
bun run dev
```

Vite will display the frontend's local development address.

### 5. Generate the ML dataset

From the repository root:

```bash
PYTHONPATH=. python3 ml/training/dataset_generator.py
```

### 6. Train the U-Net

```bash
PYTHONPATH=. python3 ml/training/train.py
```

The trained checkpoint is saved at:

```text
ml/weights/unet_flood.pth
```

For more detailed setup and execution instructions, refer to `docs/DEVELOPMENT.md`.

---

## Documentation

Detailed documentation is available in the `docs/` directory.

| Document | Description |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Overall system architecture and component interactions |
| [Backend](docs/BACKEND.md) | FastAPI services and API endpoints |
| [Geospatial Pipeline](docs/GEOSPATIAL.md) | Geographic data acquisition and grid generation |
| [Physics Simulation](docs/SIMULATION.md) | C++ solver and numerical methods |
| [ML Prototype](docs/ML_PROTOTYPE.md) | Dataset, U-Net, training, inference, and evaluation |
| [Development Guide](docs/DEVELOPMENT.md) | Setup, execution, and Git workflow |
| [Data Contract](DATA_CONTRACT.md) | Shared data formats, units, and tensor layouts |

---

## Current Limitations

WETHAREPOT is an active research and development prototype.

Current limitations include:

- The ML surrogate has not yet demonstrated reliable generalization to unseen geographic regions.
- The current training loss does not enforce the complete shallow-water equations.
- The model currently overpredicts water depth on the held-out test dataset.
- End-to-end integration between all components requires further validation.
- The geospatial pipeline uses NPZ files for cached data, while parts of the C++ solver interface use raw binary grid files.
- Independent real-world flood observations have not yet been established as a validation benchmark.

## Future Work

Potential future improvements include:

- Incorporating explicit PDE residuals into the ML objective.
- Enforcing mass and momentum conservation.
- Improving training data coverage.
- Improving performance on unseen geographic regions.
- Evaluating surrogate inference speed against the physics solver.
- Standardizing data exchange between C++ and Python.
- Improving real-time visualization and simulation delivery.

---

## Project Information

**Project:** WETHAREPOT  
**Challenge:** Build Beyond '26  
**Problem Statement:** PS 1.2 — Physics-Informed Neural Surrogate for Real-Time Urban Flood Forecasting

**Repository:** [GitHub - WETHAREPOT](https://github.com/Ieatfingies/WETHAREPOT)

**Status:** Research and development prototype.