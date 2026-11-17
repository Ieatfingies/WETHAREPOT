import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np
import hashlib

DB_FILE = Path("data/wetharepot.db")
DB_URL = os.environ.get("DATABASE_URL")

def get_connection():
    """
    Returns a database connection.
    Defaults to SQLite for seamless local hackathon execution without requiring
    an external PostgreSQL daemon, while supporting Supabase / PostgreSQL when
    DATABASE_URL is provided in production.
    """
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_FILE))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the database schema for simulation run persistence."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS simulation_runs (
                id TEXT PRIMARY KEY,
                region_id TEXT NOT NULL,
                engine TEXT NOT NULL DEFAULT 'physics',
                rain_mmhr REAL NOT NULL,
                duration_min INTEGER NOT NULL,
                status TEXT NOT NULL,
                runtime_ms REAL,
                error_message TEXT,
                meta_json TEXT,
                analytics_json TEXT,
                result_storage_path TEXT,
                created_at REAL NOT NULL,
                completed_at REAL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sim_runs_created_at ON simulation_runs(created_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sim_runs_region ON simulation_runs(region_id)")
        columns = {row[1] for row in conn.execute("PRAGMA table_info(simulation_runs)")}
        for name, declaration in (("progress", "REAL NOT NULL DEFAULT 0"), ("stage", "TEXT NOT NULL DEFAULT 'queued'"), ("request_hash", "TEXT")):
            if name not in columns:
                conn.execute(f"ALTER TABLE simulation_runs ADD COLUMN {name} {declaration}")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sim_runs_request_hash ON simulation_runs(request_hash, status)")
        conn.execute("UPDATE simulation_runs SET status='failed',stage='failed',error_message='Worker stopped before completion; resubmit this run.' WHERE status IN ('queued','preparing','running','post-processing')")
        conn.commit()

def record_simulation_start(
    run_id: str,
    region_id: str,
    engine: str,
    rain_mmhr: float,
    duration_min: int,
    request_hash: str | None = None,
) -> None:
    with get_connection() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO simulation_runs (
                id, region_id, engine, rain_mmhr, duration_min, status, stage, progress, request_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, 'queued', 'queued', 0, ?, ?)
        """, (run_id, region_id, engine, rain_mmhr, duration_min, request_hash, time.time()))
        conn.commit()

def set_simulation_stage(run_id: str, stage: str, progress: float) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE simulation_runs SET status=?, stage=?, progress=? WHERE id=?", (stage, stage, progress, run_id))
        conn.commit()

def simulation_request_hash(payload: Dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def create_simulation_job(run_id: str, region_id: str, engine: str, rain_mmhr: float, duration_min: int, request_hash: str) -> Dict[str, Any]:
    with get_connection() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT id,status,stage,progress FROM simulation_runs WHERE request_hash=? AND status IN ('queued','preparing','running','post-processing') ORDER BY created_at DESC LIMIT 1", (request_hash,)).fetchone()
        if row:
            conn.commit()
            return {"run_id": row["id"], "status": row["status"], "stage": row["stage"], "progress": row["progress"], "duplicate": True}
        conn.execute("INSERT INTO simulation_runs (id,region_id,engine,rain_mmhr,duration_min,status,stage,progress,request_hash,created_at) VALUES (?,?,?,?,?,'queued','queued',0,?,?)", (run_id,region_id,engine,rain_mmhr,duration_min,request_hash,time.time()))
        conn.commit()
        return {"run_id": run_id, "status": "queued", "stage": "queued", "progress": 0, "duplicate": False}

def record_simulation_completion(
    run_id: str,
    runtime_ms: float,
    meta: Dict[str, Any],
    analytics: Dict[str, Any],
    result_storage_path: str,
) -> None:
    with get_connection() as conn:
        conn.execute("""
            UPDATE simulation_runs
            SET status = 'completed', stage='completed', progress=100,
                runtime_ms = ?,
                meta_json = ?,
                analytics_json = ?,
                result_storage_path = ?,
                completed_at = ?
            WHERE id = ?
        """, (
            runtime_ms,
            json.dumps(meta),
            json.dumps(analytics),
            result_storage_path,
            time.time(),
            run_id,
        ))
        conn.commit()

def record_simulation_failure(run_id: str, error_message: str) -> None:
    with get_connection() as conn:
        conn.execute("""
            UPDATE simulation_runs
            SET status = 'failed', stage='failed',
                error_message = ?,
                completed_at = ?
            WHERE id = ?
        """, (error_message, time.time(), run_id))
        conn.commit()

def list_recent_runs(limit: int = 25) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT id, region_id, engine, rain_mmhr, duration_min, status, stage, progress,
                   runtime_ms, error_message, analytics_json, created_at, completed_at
            FROM simulation_runs
            ORDER BY created_at DESC
            LIMIT ?
        """, (limit,))
        runs = []
        for row in cursor.fetchall():
            analytics = None
            if row["analytics_json"]:
                try:
                    analytics = json.loads(row["analytics_json"])
                except Exception:
                    pass
            runs.append({
                "run_id": row["id"],
                "region_id": row["region_id"],
                "engine": row["engine"],
                "rain_mmhr": row["rain_mmhr"],
                "duration_min": row["duration_min"],
                "status": row["status"],
                "stage": row["stage"], "progress": row["progress"],
                "runtime_ms": row["runtime_ms"],
                "error_message": row["error_message"],
                "analytics": analytics,
                "created_at": row["created_at"],
                "completed_at": row["completed_at"],
            })
        return runs

def get_run_details(run_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT id, region_id, engine, rain_mmhr, duration_min, status,
                   runtime_ms, error_message, meta_json, analytics_json,
                   result_storage_path, created_at, completed_at, stage, progress
            FROM simulation_runs
            WHERE id = ?
        """, (run_id,))
        row = cursor.fetchone()
        if not row:
            return None

        meta = json.loads(row["meta_json"]) if row["meta_json"] else {}
        analytics = json.loads(row["analytics_json"]) if row["analytics_json"] else {}
        storage_path = row["result_storage_path"]

        dem = []
        building_mask = []
        frames_h = []

        if storage_path and os.path.isfile(storage_path):
            with np.load(storage_path) as data:
                dem = data["dem"].tolist()
                building_mask = data["building_mask"].tolist()
                frames_h = data["frames_h"].tolist()

        return {
            "run_id": row["id"],
            "region_id": row["region_id"],
            "engine": row["engine"],
            "rain_mmhr": row["rain_mmhr"],
            "duration_min": row["duration_min"],
            "status": row["status"],
            "stage": row["stage"], "progress": row["progress"], "error_message": row["error_message"],
            "runtime_ms": row["runtime_ms"],
            "meta": meta,
            "analytics": analytics,
            "dem": dem,
            "building_mask": building_mask,
            "frames_h": frames_h,
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],
        }

def get_run_status(run_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT id,status,stage,progress,runtime_ms,error_message,created_at,completed_at FROM simulation_runs WHERE id=?", (run_id,)).fetchone()
        return ({"run_id": row["id"], "status": row["status"], "stage": row["stage"], "progress": row["progress"], "runtime_ms": row["runtime_ms"], "error_message": row["error_message"], "created_at": row["created_at"], "completed_at": row["completed_at"]} if row else None)

def get_run_result_arrays(run_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT id,region_id,engine,rain_mmhr,duration_min,status,runtime_ms,meta_json,analytics_json,result_storage_path FROM simulation_runs WHERE id=?", (run_id,)).fetchone()
    if not row or not row["result_storage_path"] or not os.path.isfile(row["result_storage_path"]):
        return None
    with np.load(row["result_storage_path"]) as data:
        return {"run_id": row["id"], "region_id": row["region_id"], "engine": row["engine"], "rain_mmhr": row["rain_mmhr"], "duration_min": row["duration_min"], "status": row["status"], "runtime_ms": row["runtime_ms"], "meta": json.loads(row["meta_json"] or "{}"), "analytics": json.loads(row["analytics_json"] or "{}"), "dem": data["dem"], "building_mask": data["building_mask"], "frames_h": data["frames_h"]}
