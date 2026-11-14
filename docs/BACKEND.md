# Backend Documentation

## 1. Overview

The backend is the central coordination layer of WETHAREPOT.

It receives requests from the frontend, validates input, invokes the required simulation service, processes the resulting flood data, and returns structured responses.

The backend is built using **Python and FastAPI**.

## 2. Directory Structure

The backend is organized as follows:

```text
backend/
├── api/
│   └── routes.py
├── core/
│   ├── config.py
│   └── schemas.py
├── services/
│   ├── analytics.py
│   ├── physics_runner.py
│   └── surrogate_runner.py
└── main.py
```

## 3. Main Components

### 3.1 Application Entry Point

**File:** `backend/main.py`

This file initializes the FastAPI application.

It serves as the entry point for running the backend and connects the API routes to the application.

### 3.2 API Routes

**File:** `backend/api/routes.py`

This file defines the HTTP endpoints exposed by the backend.

The implemented endpoints include:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Checks backend availability |
| GET | `/api/regions` | Returns available simulation regions |
| POST | `/api/simulate` | Accepts a simulation request |

The simulation endpoint acts as the entry point for requesting flood predictions.

### 3.3 Configuration

**File:** `backend/core/config.py`

This file contains configuration settings used by the backend.

The configuration includes settings for the physics solver and ML surrogate.

Important physics solver settings include:

- Solver executable path.
- Grid size.
- Grid resolution.
- Output save interval.
- Execution timeout.

Important surrogate settings include:

- Model checkpoint path.
- Macro simulation step duration.

The default surrogate checkpoint is:

```text
ml/weights/unet_flood.pth
```

### 3.4 Request and Response Schemas

**File:** `backend/core/schemas.py`

This file defines the data structures used for API communication.

Schemas provide a consistent structure for the data exchanged between the frontend and backend.

They help validate incoming requests and organize outgoing responses.

## 4. Backend Services

The services directory contains the main execution and processing logic.

### 4.1 Physics Runner

**File:** `backend/services/physics_runner.py`

The physics runner is responsible for executing the C++ shallow-water-equation solver.

Its responsibilities include:

1. Preparing the solver execution configuration.
2. Locating the solver executable.
3. Supplying the simulation parameters.
4. Running the solver as an external process.
5. Collecting generated simulation output.

The configured default executable path is:

```text
build/swe_solver.exe
```

The runner uses a configured timeout to limit solver execution time.

### 4.2 Surrogate Runner

**File:** `backend/services/surrogate_runner.py`

The surrogate runner connects the backend to the PyTorch-based flood prediction model.

It invokes the inference function from:

```text
ml/inference/predict.py
```

The runner supplies the required information, including:

- Digital elevation model.
- Building mask.
- Surface roughness.
- Rainfall intensity.
- Simulation duration.
- Model weights path.

The surrogate produces a sequence of predicted water-depth frames.

The default checkpoint is:

```text
ml/weights/unet_flood.pth
```

The configured macro simulation step is 60 seconds.

### 4.3 Analytics Service

**File:** `backend/services/analytics.py`

The analytics service processes the flood simulation output.

It works with the final two-dimensional water-depth grid and calculates summary information.

Examples of useful flood statistics include:

- Maximum water depth.
- Mean water depth.
- Total depth across the grid.

These statistics can be used to summarize the predicted flood conditions for the frontend.

## 5. Simulation Request Workflow

The backend follows this general workflow when a simulation is requested:

1. The frontend sends an HTTP request to `/api/simulate`.
2. The backend receives and validates the request.
3. The relevant simulation execution path is selected.
4. The physics runner or surrogate runner is invoked.
5. The selected component generates flood simulation output.
6. The analytics service processes the resulting depth grid.
7. The backend prepares the response.
8. The frontend receives the results.

The exact execution path and response structure depend on the implementation in `routes.py` and the associated schemas.

## 6. Physics and Surrogate Execution

WETHAREPOT contains two distinct approaches to flood prediction.

| Component | Approach | Main purpose |
|---|---|---|
| Physics runner | C++ numerical simulation | Simulates flood behaviour using physical equations |
| Surrogate runner | PyTorch U-Net | Predicts flood states using a trained neural network |

The physics-based solver provides the simulation data used in the project.

The surrogate model aims to approximate flood evolution more efficiently.

Both execution paths are coordinated through the backend services.

## 7. Running the Backend

Run the following commands from the repository root.

### Step 1: Install dependencies

```bash
pip install numpy torch fastapi uvicorn pydantic requests geopandas osmnx rasterio shapely pyproj matplotlib
```

### Step 2: Start the backend

```bash
python -m uvicorn backend.main:app --reload --port 8000
```

The backend should become available at:

```text
http://127.0.0.1:8000
```

### Step 3: Check backend health

Open:

```text
http://127.0.0.1:8000/api/health
```

The health endpoint can be used to check whether the backend is responding.

## 8. Integration Considerations

The backend coordinates multiple components that use different technologies and data formats.

Important integration considerations include:

- Consistent grid dimensions.
- Correct coordinate reference systems.
- Consistent units for elevation, depth, velocity, and rainfall.
- Correct paths to the solver executable and model checkpoint.
- Consistent input and output array shapes.
- Handling solver failures and execution timeouts.
- Ensuring that the frontend receives the expected response structure.

The shared data specification is documented in the root-level `DATA_CONTRACT.md`.

One important implementation detail is that the C++ runner currently exchanges raw binary grid files, while the geospatial pipeline uses NPZ files for cached data. These formats must be handled correctly when connecting the components.

## 9. Current Limitations

The backend is part of a developing prototype.

The following areas require further testing and integration:

- End-to-end validation of frontend and backend communication.
- Consistent data exchange between the geospatial pipeline and simulation runner.
- Error handling for failed solver executions.
- Validation of surrogate predictions against physics-based simulation.
- Performance testing for different grid sizes and rainfall conditions.

## 10. Future Improvements

Potential backend improvements include:

- Asynchronous simulation execution.
- Better error reporting.
- Simulation job tracking.
- Caching of frequently requested geographic inputs.
- More detailed flood analytics.
- Improved management of physics and surrogate execution.
- Standardized data exchange across Python and C++ components.

---

**Project:** WETHAREPOT  
**Document:** Backend Documentation  
**Purpose:** Describe the backend architecture, services, API endpoints, and execution workflow.