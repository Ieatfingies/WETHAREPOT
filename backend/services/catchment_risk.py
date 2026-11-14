"""
WETHAREPOT — Catchment Flood Risk Assessment Engine
Combines real-time precipitation, DEM low-lying depression indices, and historical
drainage vulnerability to evaluate urban flood risk for all Bengaluru catchments.
"""

from typing import Any, Dict, List
from geospatial.acquisition.regions import BENGALURU_REGIONS

# Topographic vulnerability factors based on Copernicus DEM depressions & drainage outlets
CATCHMENT_VULNERABILITY = {
    "koramangala": {"base_factor": 1.35, "drainage_capacity_mmhr": 45.0, "critical_landmarks": ["Sony World Jn", "100ft Road", "Koramangala 4th Block"]},
    "bellandur": {"base_factor": 1.45, "drainage_capacity_mmhr": 40.0, "critical_landmarks": ["Bellandur Spillway", "Yemalur Junction", "Outer Ring Road"]},
    "hebbal": {"base_factor": 1.20, "drainage_capacity_mmhr": 55.0, "critical_landmarks": ["Hebbal Flyover Sump", "Nagawara Inflow Channel"]},
    "indiranagar": {"base_factor": 0.95, "drainage_capacity_mmhr": 60.0, "critical_landmarks": ["12th Main Low Point", "Doopanahalli Valley"]},
    "hsr_layout": {"base_factor": 1.30, "drainage_capacity_mmhr": 45.0, "critical_landmarks": ["HSR Sector 6", "Agara Lake Ingress", "Silk Board Link"]},
    "whitefield": {"base_factor": 1.10, "drainage_capacity_mmhr": 50.0, "critical_landmarks": ["Varthur Lake Channel", "Hope Farm Jn"]},
    "marathahalli": {"base_factor": 1.25, "drainage_capacity_mmhr": 48.0, "critical_landmarks": ["Kalamandir Underpass", "Multiplex Road"]},
    "silk_board": {"base_factor": 1.50, "drainage_capacity_mmhr": 35.0, "critical_landmarks": ["Central Silk Board Junction", "Madiwala Overflow"]},
    "electronic_city": {"base_factor": 0.90, "drainage_capacity_mmhr": 65.0, "critical_landmarks": ["Phase 1 Toll Plaza", "Tollgate Underpass"]},
    "jayanagar": {"base_factor": 0.85, "drainage_capacity_mmhr": 70.0, "critical_landmarks": ["4th Block Complex", "Madhavan Park Drain"]},
    "malleshwaram": {"base_factor": 0.80, "drainage_capacity_mmhr": 75.0, "critical_landmarks": ["Sankey Tank Inflow", "Sampige Road"]},
    "rajajinagar": {"base_factor": 0.80, "drainage_capacity_mmhr": 75.0, "critical_landmarks": ["Dr Rajkumar Road Underpass", "1st Block"]},
}


def evaluate_catchment_risks(current_rain_mmhr: float, forecast_max_rain_mmhr: float = 0.0) -> List[Dict[str, Any]]:
    """
    Evaluates flood risk score and severity for all monitored Bengaluru catchments.
    Calculates physically grounded vulnerability tiers based on rainfall vs drainage capacity.
    """
    effective_rain = max(current_rain_mmhr, forecast_max_rain_mmhr * 0.75)
    results = []

    for region_id, reg_info in BENGALURU_REGIONS.items():
        vuln = CATCHMENT_VULNERABILITY.get(region_id, {"base_factor": 1.0, "drainage_capacity_mmhr": 50.0, "critical_landmarks": []})
        capacity = vuln["drainage_capacity_mmhr"]
        factor = vuln["base_factor"]

        # Risk Score (0.0 to 100.0)
        # Ratio of rainfall to localized drainage design capacity
        stress_ratio = (effective_rain / capacity) * factor

        if stress_ratio < 0.25:
            tier = "LOW"
            severity = "Advisory"
            est_inundation_km2 = 0.0
            description = "Nominal drainage capacity. Stormwater runoff within canal tolerance."
        elif stress_ratio < 0.65:
            tier = "MODERATE"
            severity = "Watch"
            est_inundation_km2 = round(0.12 * factor, 2)
            description = "Local gutter saturation possible. Road surface sheet flow expected."
        elif stress_ratio < 1.15:
            tier = "HIGH"
            severity = "Warning"
            est_inundation_km2 = round(0.48 * factor, 2)
            description = "Primary stormwater drains exceeding 85% capacity. Waterlogging at underpasses."
        else:
            tier = "SEVERE"
            severity = "Emergency Action"
            est_inundation_km2 = round(1.15 * factor, 2)
            description = "Severe overflow expected along natural drainage corridors. Ingress into ground floors."

        results.append({
            "region_id": region_id,
            "name": reg_info["name"],
            "center": reg_info["center"],
            "risk_score": round(min(100.0, stress_ratio * 50.0), 1),
            "tier": tier,
            "severity": severity,
            "drainage_capacity_mmhr": capacity,
            "estimated_inundation_km2": est_inundation_km2,
            "critical_landmarks": vuln["critical_landmarks"],
            "description": description,
        })

    # Sort descending by risk score
    results.sort(key=lambda x: x["risk_score"], reverse=True)
    return results
