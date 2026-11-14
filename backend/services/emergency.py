"""
WETHAREPOT — Emergency Response & Human-in-the-Loop Alert Management
Manages verified emergency facilities, human review of flood risk alerts,
and modular (strictly opt-in) emergency notification dispatch adapters.
"""

import os
import time
import math
from typing import Any, Dict, List, Optional
import requests
from backend.core.db import get_connection

# Authoritative Bengaluru Emergency Facilities (Police, Disaster Response, Hospitals)
AUTHORITATIVE_FACILITIES: List[Dict[str, Any]] = [
    {
        "id": "fac_police_krm",
        "name": "Koramangala Police Station",
        "type": "police",
        "lat": 12.9348,
        "lon": 77.6205,
        "address": "80 Feet Rd, 4th Block, Koramangala, Bengaluru, Karnataka 560034",
        "phone": "+91-80-2294-2565",
        "capabilities": ["Traffic Diversion", "Public Rescue Assistance", "Evacuation Escort"],
    },
    {
        "id": "fac_police_adg",
        "name": "Adugodi Police Station",
        "type": "police",
        "lat": 12.9431,
        "lon": 77.6102,
        "address": "Hosur Rd, Adugodi, Bengaluru, Karnataka 560030",
        "phone": "+91-80-2294-2564",
        "capabilities": ["Flood Route Control", "Emergency Patrol"],
    },
    {
        "id": "fac_police_hsr",
        "name": "HSR Layout Police Station",
        "type": "police",
        "lat": 12.9116,
        "lon": 77.6389,
        "address": "27th Main Rd, Sector 1, HSR Layout, Bengaluru, Karnataka 560102",
        "phone": "+91-80-2294-3467",
        "capabilities": ["Traffic Diversion", "Sector Inundation Monitoring"],
    },
    {
        "id": "fac_fire_blr",
        "name": "Karnataka State Fire & Emergency Services HQ",
        "type": "fire_rescue",
        "lat": 12.9634,
        "lon": 77.5855,
        "address": "No.1, Annaswamy Mudaliar Rd, Halasuru, Bengaluru 560042",
        "phone": "101 / +91-80-2297-1500",
        "capabilities": ["High-Capacity Dewatering Pumps", "Boat Rescue Teams", "Swiftwater Rescue"],
    },
    {
        "id": "fac_ndrf_rc",
        "name": "NDRF Regional Response Centre Bengaluru",
        "type": "disaster_relief",
        "lat": 13.0358,
        "lon": 77.5970,
        "address": "Yelahanka Air Force Station Perimeter, Bengaluru 560064",
        "phone": "+91-80-2847-8141",
        "capabilities": ["Flood Rescue Teams (FRT)", "Inflatable Motorized Boats", "Medical First Responders"],
    },
    {
        "id": "fac_hosp_stjohn",
        "name": "St. John's Medical College Hospital",
        "type": "hospital",
        "lat": 12.9304,
        "lon": 77.6198,
        "address": "Sarjapur - Marathahalli Rd, John Nagar, Koramangala, Bengaluru 560034",
        "phone": "+91-80-2206-5000",
        "capabilities": ["24x7 Level 1 Trauma Care", "Ambulance Fleet", "Mass Casualty Triage"],
    },
    {
        "id": "fac_hosp_manipal",
        "name": "Manipal Hospital Old Airport Road",
        "type": "hospital",
        "lat": 12.9592,
        "lon": 77.6499,
        "address": "98, HAL Old Airport Rd, Kodihalli, Bengaluru 560017",
        "phone": "+91-80-2502-4444",
        "capabilities": ["Emergency & Trauma Care", "Critical Care Transit"],
    },
]


def init_alerts_table():
    """Initializes the emergency_alerts table in SQLite / PostgreSQL."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS emergency_alerts (
                id TEXT PRIMARY KEY,
                region_id TEXT NOT NULL,
                region_name TEXT NOT NULL,
                severity TEXT NOT NULL,
                risk_score REAL NOT NULL,
                title TEXT NOT NULL,
                incident_summary TEXT NOT NULL,
                evidence_json TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                acknowledged_by TEXT,
                acknowledged_at REAL,
                resolution_notes TEXT,
                created_at REAL NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON emergency_alerts(created_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_alerts_region ON emergency_alerts(region_id)")
        conn.commit()


def get_nearby_facilities(lat: float, lon: float, limit: int = 4) -> List[Dict[str, Any]]:
    """
    Finds verified emergency facilities closest to the given geographic coordinate.
    Computes accurate haversine distance in kilometers.
    """
    google_places_key = os.environ.get("GOOGLE_PLACES_API_KEY")

    if google_places_key:
        try:
            # Google Places API Nearby Search
            url = f"https://maps.googleapis.com/maps/api/place/nearbysearch/json?location={lat},{lon}&radius=5000&type=police|hospital|fire_station&key={google_places_key}"
            resp = requests.get(url, timeout=4)
            if resp.status_code == 200:
                places = resp.json().get("results", [])
                formatted = []
                for p in places[:limit]:
                    p_loc = p.get("geometry", {}).get("location", {})
                    p_lat, p_lon = p_loc.get("lat", lat), p_loc.get("lng", lon)
                    dist = _haversine_distance(lat, lon, p_lat, p_lon)
                    formatted.append({
                        "id": p.get("place_id", f"place_{time.time()}"),
                        "name": p.get("name", "Emergency Facility"),
                        "type": p.get("types", ["emergency"])[0],
                        "lat": p_lat,
                        "lon": p_lon,
                        "address": p.get("vicinity", "Bengaluru, Karnataka"),
                        "distance_km": round(dist, 2),
                        "source": "Google Places API",
                    })
                if formatted:
                    return formatted
        except Exception as exc:
            print(f"[Emergency] Google Places API search error: {exc}. Using verified baseline registry.")

    # Haversine distance ranking from verified baseline facilities
    ranked = []
    for fac in AUTHORITATIVE_FACILITIES:
        dist = _haversine_distance(lat, lon, fac["lat"], fac["lon"])
        ranked.append({
            **fac,
            "distance_km": round(dist, 2),
            "source": "Bengaluru Disaster Management Authority Directory",
        })

    ranked.sort(key=lambda x: x["distance_km"])
    return ranked[:limit]


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two coordinates in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2 +
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def record_alert(
    region_id: str,
    region_name: str,
    severity: str,
    risk_score: float,
    title: str,
    incident_summary: str,
    evidence: Optional[Dict[str, Any]] = None,
) -> str:
    """Persists a new emergency alert into the database."""
    init_alerts_table()
    alert_id = f"alt_{int(time.time() * 1000)}"
    with get_connection() as conn:
        import json
        conn.execute("""
            INSERT INTO emergency_alerts (
                id, region_id, region_name, severity, risk_score, title,
                incident_summary, evidence_json, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
        """, (
            alert_id,
            region_id,
            region_name,
            severity,
            risk_score,
            title,
            incident_summary,
            json.dumps(evidence or {}),
            time.time(),
        ))
        conn.commit()
    return alert_id


def list_alerts(limit: int = 15) -> List[Dict[str, Any]]:
    """Retrieves active and historical emergency alerts."""
    init_alerts_table()
    with get_connection() as conn:
        import json
        cursor = conn.execute("""
            SELECT id, region_id, region_name, severity, risk_score, title,
                   incident_summary, evidence_json, status, acknowledged_by,
                   acknowledged_at, resolution_notes, created_at
            FROM emergency_alerts
            ORDER BY created_at DESC
            LIMIT ?
        """, (limit,))
        alerts = []
        for r in cursor.fetchall():
            ev = {}
            if r["evidence_json"]:
                try:
                    ev = json.loads(r["evidence_json"])
                except Exception:
                    ev = {}
            alerts.append({
                "id": r["id"],
                "region_id": r["region_id"],
                "region_name": r["region_name"],
                "severity": r["severity"],
                "risk_score": r["risk_score"],
                "title": r["title"],
                "incident_summary": r["incident_summary"],
                "evidence": ev,
                "status": r["status"],
                "acknowledged_by": r["acknowledged_by"],
                "acknowledged_at": r["acknowledged_at"],
                "resolution_notes": r["resolution_notes"],
                "created_at": r["created_at"],
            })
        return alerts


def update_alert_status(
    alert_id: str,
    status: str,
    acknowledged_by: str,
    resolution_notes: str = "",
) -> bool:
    """Updates the workflow status of an emergency alert (Human Review & Confirm)."""
    init_alerts_table()
    with get_connection() as conn:
        cursor = conn.execute("""
            UPDATE emergency_alerts
            SET status = ?, acknowledged_by = ?, acknowledged_at = ?, resolution_notes = ?
            WHERE id = ?
        """, (status, acknowledged_by, time.time(), resolution_notes, alert_id))
        conn.commit()
        return cursor.rowcount > 0
