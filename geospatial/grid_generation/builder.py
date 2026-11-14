import os
import json
import time
import requests
import numpy as np
import geopandas as gpd
import osmnx as ox
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
from rasterio.features import rasterize
from shapely.geometry import shape
from pyproj import Transformer

from geospatial.acquisition.regions import (
    BENGALURU_REGIONS,
    get_metric_bbox,
    bbox_to_wgs84_polygon,
)

ox.settings.requests_timeout = 180

RAW_DIR = "data/raw"
PROCESSED_DIR = "data/processed"
os.makedirs(RAW_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)


def fetch_copernicus_dem_tile(lat: float, lon: float) -> str:
    """Downloads and caches the 1x1 deg Copernicus 30m DEM GeoTIFF from AWS."""
    lat_deg = int(np.floor(lat))
    lon_deg = int(np.floor(lon))
    tile_name = f"Copernicus_DSM_COG_10_N{lat_deg:02d}_00_E{lon_deg:03d}_00_DEM"
    local_path = os.path.join(RAW_DIR, f"{tile_name}.tif")

    if os.path.exists(local_path):
        return local_path

    url = f"https://copernicus-dem-30m.s3.amazonaws.com/{tile_name}/{tile_name}.tif"
    print(f"[GIS] Downloading Copernicus 30m DEM tile: {url}")
    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()
    with open(local_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)
    print(f"[GIS] Saved DEM tile to {local_path}")
    return local_path


def _fetch_all_osm_layers(wgs_poly) -> gpd.GeoDataFrame:
    """Fetches buildings, roads, and water bodies in ONE Overpass call with retry backoff."""
    combined_tags = {
        "building": True,
        "highway": True,
        "natural": "water",
    }
    for attempt in range(3):
        try:
            gdf = ox.features_from_polygon(wgs_poly, tags=combined_tags)
            if gdf.empty:
                return gpd.GeoDataFrame(geometry=[], crs="EPSG:32643")
            return gdf[gdf.geometry.notnull()].to_crs("EPSG:32643")
        except Exception as e:
            wait = 2 ** (attempt + 1)
            print(f"[GIS] Overpass busy (attempt {attempt + 1}/3), retrying in {wait}s... ({e})")
            time.sleep(wait)
    print("[GIS] Warning: Overpass failed after 3 attempts; falling back to DEM-only.")
    return gpd.GeoDataFrame(geometry=[], crs="EPSG:32643")


def build_region_grids(
    region_id: str | None = None,
    custom_geojson: dict | None = None,
    grid_size: int = 256,
    resolution_m: float = 10.0,
    force_refresh: bool = False,
) -> str:
    """
    Generates standardized (H, W) grids (dem, building_mask, roughness) in EPSG:32643
    and caches them as a .npz file + metadata JSON.
    """
    size_m = grid_size * resolution_m

    if region_id:
        if region_id not in BENGALURU_REGIONS:
            raise ValueError(f"Unknown region_id: {region_id}")
        cache_key = f"{region_id}_{grid_size}"
        lat, lon = BENGALURU_REGIONS[region_id]["center"]
        minx, miny, maxx, maxy = get_metric_bbox(lat, lon, size_m=size_m)
    elif custom_geojson:
        geom_wgs = shape(custom_geojson)
        centroid = geom_wgs.centroid
        lat, lon = centroid.y, centroid.x
        minx, miny, maxx, maxy = get_metric_bbox(lat, lon, size_m=size_m)
        cache_key = f"custom_{abs(hash(json.dumps(custom_geojson, sort_keys=True))) % 10**8}_{grid_size}"
    else:
        raise ValueError("Provide either region_id or custom_geojson.")

    out_npz = os.path.join(PROCESSED_DIR, f"{cache_key}.npz")
    out_meta = os.path.join(PROCESSED_DIR, f"{cache_key}.json")

    if os.path.exists(out_npz) and not force_refresh:
        print(f"[GIS] Cache hit: {out_npz}")
        return out_npz

    # 1. Reproject & resample DEM onto exact target grid
    dem_tif = fetch_copernicus_dem_tile(lat, lon)
    dst_transform = from_bounds(minx, miny, maxx, maxy, grid_size, grid_size)
    dem_grid = np.zeros((grid_size, grid_size), dtype=np.float32)

    with rasterio.open(dem_tif) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=dem_grid,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=dst_transform,
            dst_crs="EPSG:32643",
            resampling=Resampling.bilinear,
        )

    if np.isnan(dem_grid).any():
        dem_grid = np.nan_to_num(dem_grid, nan=float(np.nanmean(dem_grid)))

    # 2. Fetch all OSM vector layers in a single batched query
    wgs_poly = bbox_to_wgs84_polygon(minx, miny, maxx, maxy)
    all_osm = _fetch_all_osm_layers(wgs_poly)

    buildings_gdf = (
        all_osm[all_osm["building"].notnull()]
        if "building" in all_osm.columns
        else gpd.GeoDataFrame(geometry=[], crs="EPSG:32643")
    )
    roads_gdf = (
        all_osm[all_osm["highway"].notnull()]
        if "highway" in all_osm.columns
        else gpd.GeoDataFrame(geometry=[], crs="EPSG:32643")
    )
    lakes_gdf = (
        all_osm[all_osm["natural"] == "water"]
        if "natural" in all_osm.columns
        else gpd.GeoDataFrame(geometry=[], crs="EPSG:32643")
    )

    # 3. Rasterize Building Obstacle Mask (1 = solid obstacle, 0 = open)
    if not buildings_gdf.empty:
        poly_bldgs = buildings_gdf[buildings_gdf.geometry.type.isin(["Polygon", "MultiPolygon"])]
        building_mask = rasterize(
            [(g, 1.0) for g in poly_bldgs.geometry],
            out_shape=(grid_size, grid_size),
            transform=dst_transform,
            fill=0.0,
            dtype=np.float32,
        )
    else:
        building_mask = np.zeros((grid_size, grid_size), dtype=np.float32)

    # 4. Rasterize Manning's Roughness (n): 0.035 default, 0.025 lakes, 0.015 roads
    roughness = np.full((grid_size, grid_size), 0.035, dtype=np.float32)

    if not lakes_gdf.empty:
        poly_lakes = lakes_gdf[lakes_gdf.geometry.type.isin(["Polygon", "MultiPolygon"])]
        if not poly_lakes.empty:
            lake_mask = rasterize(
                [(g, 1) for g in poly_lakes.geometry],
                out_shape=(grid_size, grid_size),
                transform=dst_transform,
                fill=0,
                dtype=np.uint8,
            )
            roughness[lake_mask == 1] = 0.025

    if not roads_gdf.empty:
        buffered_roads = roads_gdf.geometry.buffer(5.0)
        road_mask = rasterize(
            [(g, 1) for g in buffered_roads],
            out_shape=(grid_size, grid_size),
            transform=dst_transform,
            fill=0,
            dtype=np.uint8,
        )
        roughness[road_mask == 1] = 0.015

    building_mask[roughness == 0.015] = 0.0

    # 5. Save standardized NPZ + Metadata
    np.savez_compressed(
        out_npz,
        dem=dem_grid.astype(np.float32),
        building_mask=building_mask.astype(np.float32),
        roughness=roughness.astype(np.float32),
    )

    to_wgs = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)
    w_min_lon, w_min_lat = to_wgs.transform(minx, miny)
    w_max_lon, w_max_lat = to_wgs.transform(maxx, maxy)

    meta = {
        "cache_key": cache_key,
        "region_id": region_id,
        "crs": "EPSG:32643",
        "grid_size": grid_size,
        "resolution_m": resolution_m,
        "bounds_utm": [minx, miny, maxx, maxy],
        "bounds_wgs84": [w_min_lon, w_min_lat, w_max_lon, w_max_lat],
        "elevation_min_m": float(dem_grid.min()),
        "elevation_max_m": float(dem_grid.max()),
        "building_coverage_pct": float(building_mask.mean() * 100.0),
    }
    with open(out_meta, "w") as f:
        json.dump(meta, f, indent=2)

    print(
        f"[GIS] Generated {out_npz} | Elev: {meta['elevation_min_m']:.1f}m–{meta['elevation_max_m']:.1f}m | Buildings: {meta['building_coverage_pct']:.1f}%"
    )
    return out_npz