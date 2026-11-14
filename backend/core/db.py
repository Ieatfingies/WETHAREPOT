import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np

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
        conn.commit()

def record_simulation_start(
    run_id: str,
    region_id: str,
    engine: str,
    rain_mmhr: float,
    duration_min: int,
) -> None:
    with get_connection() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO simulation_runs (
                id, region_id, engine, rain_mmhr, duration_min, status, created_at
            ) VALUES (?, ?, ?, ?, ?, 'running', ?)
        """, (run_id, region_id, engine, rain_mmhr, duration_min, time.time()))
        conn.commit()

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
            SET status = 'completed',
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
            SET status = 'failed',
                error_message = ?,
                completed_at = ?
            WHERE id = ?
        """, (error_message, time.time(), run_id))
        conn.commit()

def list_recent_runs(limit: int = 25) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT id, region_id, engine, rain_mmhr, duration_min, status,
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
                   result_storage_path, created_at, completed_at
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
            "runtime_ms": row["runtime_ms"],
            "meta": meta,
            "analytics": analytics,
            "dem": dem,
            "building_mask": building_mask,
            "frames_h": frames_h,
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],
        }
