import numpy as np
from backend.core.config import FloodRiskThresholds
from backend.core.schemas import FloodAnalytics


def compute_flood_analytics(
    final_depth_m: np.ndarray,
    resolution_m: float,
    thresholds: FloodRiskThresholds,
) -> FloodAnalytics:
    cell_area_m2 = resolution_m * resolution_m
    m2_to_km2 = 1.0 / 1_000_000.0

    inundated_mask = final_depth_m > thresholds.inundation_cutoff_m
    moderate_mask = final_depth_m >= thresholds.moderate_hazard_m
    severe_mask = final_depth_m >= thresholds.severe_hazard_m

    inundated_cells = int(inundated_mask.sum())
    moderate_cells = int(moderate_mask.sum())
    severe_cells = int(severe_mask.sum())

    return FloodAnalytics(
        max_depth_m=round(float(final_depth_m.max()), 3),
        mean_depth_m=round(float(final_depth_m.mean()), 4),
        flooded_area_km2=round(inundated_cells * cell_area_m2 * m2_to_km2, 4),
        moderate_hazard_km2=round(moderate_cells * cell_area_m2 * m2_to_km2, 4),
        severe_hazard_km2=round(severe_cells * cell_area_m2 * m2_to_km2, 4),
        total_volume_m3=round(float(final_depth_m.sum() * cell_area_m2), 1),
        inundated_cell_count=inundated_cells,
    )