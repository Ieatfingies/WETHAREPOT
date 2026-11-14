from shapely.geometry import box
from pyproj import Transformer

BENGALURU_REGIONS = {
    "bellandur": {
        "name": "Bellandur Lake Catchment",
        "center": (12.9352, 77.6744),
        "description": "Low-lying lake outflow & ORR IT corridor.",
    },
    "varthur": {
        "name": "Varthur Lake & Downstream",
        "center": (12.9407, 77.7412),
        "description": "Eastern valley terminus receiving Bellandur overflow.",
    },
    "koramangala": {
        "name": "Koramangala–Ejipura Valley",
        "center": (12.9355, 77.6245),
        "description": "Dense urban bowl along the K-100 rajakaluve drain.",
    },
    "hsr_layout": {
        "name": "HSR Layout & Agara Lake",
        "center": (12.9121, 77.6446),
        "description": "Flat residential grid adjacent to Agara lakebed.",
    },
    "mahadevapura": {
        "name": "Mahadevapura & Doddanekundi",
        "center": (12.9850, 77.6970),
        "description": "Heavy impervious tech-park zone with bottlenecked drains.",
    },
    "whitefield": {
        "name": "Whitefield & Hoodi Basin",
        "center": (12.9698, 77.7499),
        "description": "Rapidly urbanized eastern plateau with disconnected lakes.",
    },
    "hebbal": {
        "name": "Hebbal–Nagawara Valley",
        "center": (13.0450, 77.5980),
        "description": "Northern valley headwaters & ring road underpasses.",
    },
    "manyata_yelahanka": {
        "name": "Manyata & Rachenahalli Lake",
        "center": (13.0485, 77.6200),
        "description": "Low-gradient lake chain prone to monsoon backflow.",
    },
    "silk_board_madiwala": {
        "name": "Silk Board & Madiwala Lake",
        "center": (12.9177, 77.6238),
        "description": "Major highway junction in Madiwala surplus channel.",
    },
    "electronic_city": {
        "name": "Electronic City Phase 1",
        "center": (12.8452, 77.6602),
        "description": "Southern industrial/campus basin with steep local runoff.",
    },
    "kr_puram": {
        "name": "KR Puram & Benniganahalli",
        "center": (13.0012, 77.6763),
        "description": "Confluence of northern stormwater drains & railway underpass.",
    },
    "vrishabhavathi": {
        "name": "Vrishabhavathi Valley (Nayandahalli)",
        "center": (12.9430, 77.5250),
        "description": "Western primary river valley & Mysuru Road corridor.",
    },
}

def get_metric_bbox(lat: float, lon: float, size_m: float = 2560.0):
    """Returns (minx, miny, maxx, maxy) in EPSG:32643 centered at (lat, lon)."""
    to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True)
    cx, cy = to_utm.transform(lon, lat)
    half = size_m / 2.0
    return (cx - half, cy - half, cx + half, cy + half)

def bbox_to_wgs84_polygon(minx: float, miny: float, maxx: float, maxy: float):
    """Converts EPSG:32643 bounding box back to WGS84 Shapely polygon for OSM queries."""
    to_wgs = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)
    min_lon, min_lat = to_wgs.transform(minx, miny)
    max_lon, max_lat = to_wgs.transform(maxx, maxy)
    return box(min_lon, min_lat, max_lon, max_lat)