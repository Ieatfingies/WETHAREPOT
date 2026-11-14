# Development and Setup Guide

## 1. Overview

This document describes how to set up, run, and work with the WETHAREPOT repository.

The project combines multiple technologies:

- Python for backend services, geospatial processing, and machine learning.
- C++ for the physics-based flood simulation.
- PyTorch for the U-Net surrogate model.
- React and TypeScript for the frontend.
- FastAPI for backend API communication.

## 2. Repository Structure

The main repository structure is:

```text
WETHAREPOT/
├── backend/
├── frontend/
├── geospatial/
├── simulation/
├── ml/
├── docs/
├── DATA_CONTRACT.md
└── build/
```

| Directory/File | Purpose |
|---|---|
| `backend/` | API and backend services |
| `frontend/` | User interface |
| `geospatial/` | Geographic data acquisition and processing |
| `simulation/` | C++ flood simulation |
| `ml/` | Machine-learning surrogate |
| `docs/` | Project documentation |
| `DATA_CONTRACT.md` | Shared data specification |
| `build/` | Compiled simulation executable |

## 3. Prerequisites

The development environment requires the following tools:

| Tool | Purpose |
|---|---|
| Python 3 | Backend, geospatial pipeline, and ML |
| pip | Python package installation |
| C++ compiler | Building the physics solver |
| Bun | Frontend dependency management |
| Git | Version control |
| Node.js | Frontend tooling runtime |

The development environment used for the ML prototype includes an Apple Silicon Mac with MPS acceleration.

## 4. Repository Setup

Clone the repository:

```bash
git clone https://github.com/Ieatfingies/WETHAREPOT.git
```

Move into the project directory:

```bash
cd WETHAREPOT
```

Check the current Git branch:

```bash
git branch
```

The main integration branch is:

```text
main
```

## 5. Python Environment

It is recommended to use a virtual environment to isolate project dependencies.

Create the environment:

```bash
python3 -m venv .venv
```

Activate it:

```bash
source .venv/bin/activate
```

Upgrade pip:

```bash
python -m pip install --upgrade pip
```

Install the required Python packages:

```bash
pip install numpy scipy rasterio osmnx geopandas shapely pyproj requests matplotlib torch fastapi uvicorn pydantic
```

The project uses these packages for numerical processing, geographic data handling, model training, and backend services.

To deactivate the environment:

```bash
deactivate
```

## 6. Running the Backend

Run the backend from the repository root.

Start the FastAPI application:

```bash
python -m uvicorn backend.main:app --reload --port 8000
```

The backend runs locally at:

```text
http://127.0.0.1:8000
```

Available implemented endpoints include:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend health check |
| GET | `/api/regions` | Available geographic regions |
| POST | `/api/simulate` | Simulation request |

## 7. Running the Frontend

Open another terminal window.

Navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun run dev
```

Vite will display the local frontend address in the terminal.

Keep the frontend and backend running in separate terminal windows during development.

## 8. Building the Physics Solver

The physics solver is implemented in C++.

The repository includes a `build/` directory containing the solver executable.

The configured backend executable path is:

```text
build/swe_solver.exe
```

The command-line interface accepts the following arguments:

```bash
swe_solver <input_dir> <output_dir> <grid_size> <dx_m> <rain_mmhr> <duration_s> [save_interval_s]
```

The solver requires the appropriate input grid files and generates binary output frames.

Before rebuilding the solver, inspect the existing build configuration and source files to determine the correct compiler command for your environment.

## 9. Machine-Learning Workflow

The ML component has three main stages.

### 9.1 Dataset Generation

From the repository root:

```bash
PYTHONPATH=. python3 ml/training/dataset_generator.py
```

The generator creates training, validation, and held-out test samples.

The completed prototype dataset contained:

| Dataset | Samples |
|---|---:|
| Training | 450 |
| Validation | 30 |
| Test | 120 |

The dataset is generated separately and is not committed to the repository.

### 9.2 Model Training

Run:

```bash
PYTHONPATH=. python3 ml/training/train.py
```

The training script trains the U-Net and saves the best validation checkpoint.

Checkpoint location:

```text
ml/weights/unet_flood.pth
```

### 9.3 Inference

The inference implementation is located at:

```text
ml/inference/predict.py
```

The backend accesses the model through the surrogate runner.

The model accepts terrain, building, roughness, rainfall, and current flood-state information and predicts future flood states.

## 10. Geospatial Pipeline

The geospatial pipeline is located in:

```text
geospatial/
```

Its main responsibilities include:

- Acquiring elevation data.
- Retrieving mapped urban features.
- Generating terrain grids.
- Preparing building masks.
- Assigning surface roughness.
- Saving processed geographic data.

The project uses EPSG:32643 as its working coordinate reference system.

The standard simulation grid is 256 × 256 cells at 10-metre resolution.

Refer to `GEOSPATIAL.md` for more details.

## 11. Data and Generated Files

Some project data is generated during execution rather than stored directly in Git.

Examples include:

- Downloaded geographic datasets.
- Processed terrain grids.
- Generated NPZ datasets.
- NumPy arrays.
- Temporary simulation outputs.

Large generated datasets are excluded from version control through `.gitignore`.

The trained model checkpoint is maintained in:

```text
ml/weights/unet_flood.pth
```

The shared data format and units are defined in:

```text
DATA_CONTRACT.md
```

## 12. Git Workflow

The project uses Git and GitHub for collaborative development.

### 12.1 Check Current Branch

```bash
git branch
```

### 12.2 Check Repository Status

```bash
git status
```

### 12.3 Pull Latest Changes

Before starting new work:

```bash
git checkout main
git pull origin main
```

### 12.4 Create a Feature Branch

Create a separate branch for your work:

```bash
git checkout -b feature/your-feature-name
```

### 12.5 Stage and Commit Changes

Check the changed files:

```bash
git status
```

Stage the required files:

```bash
git add .
```

Commit:

```bash
git commit -m "Describe your changes"
```

### 12.6 Push the Feature Branch

```bash
git push -u origin feature/your-feature-name
```

### 12.7 Merge Through a Pull Request

After pushing:

1. Open the GitHub repository.
2. Create a pull request from your feature branch into `main`.
3. Review the changes.
4. Resolve any merge conflicts.
5. Merge the pull request.
6. Return to the main branch and pull the latest changes.

```bash
git checkout main
git pull origin main
```

This workflow helps prevent different contributors from directly overwriting each other's work.

## 13. Development Guidelines

When contributing to WETHAREPOT:

- Work on a separate feature branch.
- Avoid committing generated datasets and temporary outputs.
- Keep input and output formats consistent with `DATA_CONTRACT.md`.
- Maintain consistent coordinate systems and physical units.
- Test individual components before integrating them.
- Validate ML predictions against simulation outputs.
- Document significant changes.
- Pull the latest main branch before starting new work.

## 14. Troubleshooting

### Python module not found

Ensure the virtual environment is activated and dependencies are installed.

### Backend fails to start

Check that the command is executed from the repository root and that the required Python packages are installed.

### Frontend dependencies are missing

Navigate to `frontend/` and run:

```bash
bun install
```

### Solver executable not found

Check that the executable exists at the configured path and that the backend configuration points to the correct location.

### ML checkpoint not found

Check that the trained checkpoint exists at:

```text
ml/weights/unet_flood.pth
```

### Geospatial acquisition fails

Check internet connectivity and the availability of the required geographic data sources.

### Git push is rejected

Pull the latest remote changes and reconcile any conflicts before pushing again. Avoid force-pushing to shared branches.

---

**Project:** WETHAREPOT  
**Document:** Development and Setup Guide  
**Purpose:** Provide setup, execution, and contribution instructions for developers.