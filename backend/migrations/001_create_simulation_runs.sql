-- WETHAREPOT — Production Simulation Persistence Schema (PostgreSQL / Supabase)
-- Execute in Supabase SQL Editor or via standard psql

CREATE TABLE IF NOT EXISTS simulation_runs (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    engine TEXT NOT NULL DEFAULT 'physics',
    rain_mmhr REAL NOT NULL,
    duration_min INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    runtime_ms REAL,
    error_message TEXT,
    meta_json JSONB,
    analytics_json JSONB,
    result_storage_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_sim_runs_created_at ON simulation_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sim_runs_region ON simulation_runs(region_id);
CREATE INDEX IF NOT EXISTS idx_sim_runs_status ON simulation_runs(status);

COMMENT ON TABLE simulation_runs IS 'Persistent simulation metadata and storage references for WETHAREPOT hydrologic twin';
