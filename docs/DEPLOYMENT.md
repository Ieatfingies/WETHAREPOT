# WETHAREPOT — Deployment & Operations Guide

WETHAREPOT is a real-time urban flood forecasting digital twin for Bengaluru, coupling a 2D Shallow Water Equations (SWE) hydrodynamic solver with an interactive low-poly 3D WebGL twin, 2D cartographic analysis, and persistent simulation tracking.

---

## 1. Quick Start (Local Development)

### Prerequisites
- **Python 3.11+** with virtualenv
- **Bun** (or Node.js 20+)
- **CMake** and C++ compiler (optional; required only if rebuilding the C++ solver binary from scratch)

### Step 1: Backend Setup
```bash
# Clone the repository
git clone https://github.com/your-org/wetharepot.git
cd wetharepot

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI simulation server
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```
The backend initializes SQLite at `data/wetharepot.db` on first boot. Health status is accessible at `http://localhost:8000/api/health`.

### Step 2: Frontend Setup
```bash
cd frontend

# Install dependencies with Bun
bun install

# Start Vite development server
bun run dev
```
Open `http://localhost:5173` in your browser.

---

## 2. Docker & Containerized Deployment

Run the complete stack (FastAPI Backend + PostgreSQL + Nginx Frontend) with a single command:

```bash
docker compose up --build
```

- **Frontend**: Accessible at `http://localhost:3000`
- **Backend API**: Accessible at `http://localhost:8000/api`
- **PostgreSQL**: Bound to `localhost:5432` with auto-applied migrations from `backend/migrations/001_create_simulation_runs.sql`.

---

## 3. Cloud Production Deployment

### Cloudflare Pages & Workers (Edge Hosting)
The frontend is configured with native Cloudflare Pages / Workers deployment artifacts:
- `wrangler.toml` at repository root and in `frontend/`
- SPA route interception rules in `frontend/public/_routes.json`
- Strict security and immutable asset caching headers in `frontend/public/_headers`

#### Deploy with Wrangler CLI:
```bash
# 1. Build production static bundle
cd frontend
bun run build

# 2. Deploy directly to Cloudflare Pages
bunx wrangler pages deploy dist --project-name=wetharepot
```

#### Deploy via Cloudflare Dashboard (Git Integration):
1. Connect the GitHub repository to Cloudflare Pages.
2. Build configuration:
   - **Framework preset**: Vite
   - **Root directory**: `frontend`
   - **Build command**: `bun run build`
   - **Build output directory**: `dist`
3. Environment variables:
   - `VITE_API_URL`: Your hosted backend URL (e.g. `https://api.wetharepot.in`)

### Frontend (Vercel)
The frontend also includes `frontend/vercel.json` for SPA routing on Vercel:
1. Connect the `frontend/` directory to Vercel.
2. Build command: `bun run build`.
3. Output directory: `dist`.
4. Environment variable: `VITE_API_URL`.

### Backend (Render / Railway / Fly.io / AWS EC2)
The backend container is defined in the root `Dockerfile`.
1. Deploy using the provided `Dockerfile`.
2. Configure environment variables in your cloud dashboard:
   - `PORT`: `8000`
   - `DATABASE_URL`: `postgresql://user:pass@db.supabase.co:5432/postgres` (or omit for embedded SQLite)
   - `RUNS_BASE_DIR`: `/app/data/processed/api_runs`
3. Attach persistent volume storage to `/app/data` to retain simulation `.npz` rasters across deploys.

### Managed Database (Supabase / Neon)
1. Create a PostgreSQL project on Supabase or Neon.
2. In the SQL Editor, execute `backend/migrations/001_create_simulation_runs.sql`.
3. Set the `DATABASE_URL` environment variable on your backend service.

---

## 4. Architecture & Persistence Strategy

- **Metadata & Analytics**: Stored in PostgreSQL (or local SQLite) via `backend/core/db.py`. Includes run IDs, timestamps, rain/duration parameters, run status (`queued`, `running`, `completed`, `failed`), and scalar flood analytics.
- **Heavy Rasters**: 256×256 DEM, building mask, and time-series water depth arrays are compressed into `.npz` storage archives under `data/processed/api_runs/`. The database stores the path pointer `result_storage_path`.
- **Pre-simulation Exploration**: `GET /api/terrain/{region_id}` streams Copernicus DEM and building footprints immediately upon catchment selection, enabling instant 3D twin inspection before the solver starts.
- **Run History Drawer**: Users can review prior runs, inspect run duration and rainfall settings, and load historical water surfaces directly into the 2D/3D viewport.
