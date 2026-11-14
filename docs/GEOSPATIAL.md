# Geospatial Pipeline Documentation

## 1. Overview

The geospatial pipeline prepares geographic and terrain information for use by the WETHAREPOT flood forecasting system.

Urban flood simulation requires more than rainfall data. The system also needs information about terrain elevation, buildings, and surface characteristics because these influence how water moves across an area.

The geospatial pipeline converts geographic information into structured grids that can be used by the physics simulation and machine-learning components.

## 2. Directory Structure

**Location:** `geospatial/`

```text
geospatial/
├── acquisition/
│   └── regions.py
├── grid_generation/
│   └── builder.py
└── test_gis.py
```

| File | Responsibility |
|---|---|
| `acquisition/regions.py` | Defines geographic regions used by the project |
| `grid_generation/builder.py` | Acquires and processes geographic data and generates simulation grids |
| `test_gis.py` | Tests geospatial functionality |

## 3. Geographic Coordinate System

The project uses:

**EPSG:32643 — WGS 84 / UTM zone 43N**

This coordinate reference system is used for the Bengaluru study areas.

UTM coordinates use metres, making them suitable for representing physical distances and grid dimensions.

Using a consistent coordinate reference system is important when combining elevation data with building and road information.

## 4. Geographic Data Acquisition

The pipeline uses geographic data sources to construct the terrain and urban representation.

### 4.1 Digital Elevation Model

A Digital Elevation Model (DEM) represents the elevation of the terrain.

It provides the underlying ground elevation for the flood simulation.

The DEM is important because:

- Water movement is influenced by terrain elevation.
- Lower-elevation areas can collect water.
- Elevation differences influence flood propagation.

The project acquires and caches Copernicus DEM data.

### 4.2 OpenStreetMap Data

The pipeline also uses OpenStreetMap (OSM) features to represent urban characteristics.

These features help construct information such as:

- Building locations.
- Road locations.
- Other relevant mapped urban features.

If OSM acquisition fails, the pipeline can fall back to generating terrain data using the DEM alone.

This allows terrain processing to continue even when urban feature data is unavailable.

## 5. Grid Generation

The acquired geographic information is converted into raster grids.

The standard project configuration is:

| Parameter | Value |
|---|---|
| Grid width | 256 cells |
| Grid height | 256 cells |
| Resolution | 10 metres |
| Physical width | 2,560 metres |
| Physical height | 2,560 metres |
| Coordinate system | EPSG:32643 |

Each grid cell represents a 10 m × 10 m area.

The resulting grid covers a 2.56 km × 2.56 km geographic patch.

A smaller 128 × 128 grid can also be used for toy validation.

## 6. Generated Grid Layers

The pipeline prepares several layers for the flood simulation.

### 6.1 Elevation Grid

The elevation grid stores terrain height in metres.

It is used by the solver to represent the ground surface.

### 6.2 Building Mask

The building mask represents the locations of buildings.

It is used to distinguish building cells from other parts of the terrain.

### 6.3 Surface Roughness

Surface roughness represents resistance to water flow.

The project assigns Manning roughness values to different surface categories.

Current default values include:

| Surface category | Manning roughness |
|---|---:|
| General surface | 0.035 |
| Mapped lakes | 0.025 |
| Buffered roads | 0.015 |

These values are expressed in seconds per metre to the power of one-third.

The roughness grid is used by the physics simulation to model frictional resistance.

## 7. Output Data

The geospatial pipeline saves processed geographic data for later use.

The cached terrain data uses the NumPy NPZ format.

The project also stores JSON metadata describing the geographic information, including the coordinate reference system and bounding box.

The shared data specification is documented in:

```text
DATA_CONTRACT.md
```

That document defines the expected grid dimensions, array layouts, units, and channel ordering used across the project.

## 8. Relationship with the Physics Solver

The geospatial pipeline provides the terrain information required by the shallow-water-equation solver.

The relationship can be summarized as:

```text
GEOGRAPHIC DATA
      |
      v
DEM ACQUISITION
      |
      v
OSM FEATURE ACQUISITION
      |
      v
GRID GENERATION
      |
      +------------------+
      |                  |
      v                  v
 ELEVATION GRID     BUILDING MASK
      |                  |
      +--------+---------+
               |
               v
       ROUGHNESS GRID
               |
               v
       SIMULATION INPUTS
               |
               v
       PHYSICS SOLVER
```

These grids describe the physical environment in which the flood simulation takes place.

## 9. Relationship with the ML Pipeline

The geospatial data is also relevant to the machine-learning surrogate.

The U-Net receives terrain elevation, building information, and surface roughness as part of its input.

These layers provide geographic context to the model when predicting future water depth and velocity.

The ML input layout is described in `DATA_CONTRACT.md`.

## 10. Current Limitations and Considerations

The geospatial pipeline is part of a developing prototype.

Important considerations include:

- Geographic datasets must use compatible coordinate reference systems.
- Elevation and urban feature grids must align spatially.
- Missing OSM features can result in DEM-only processing.
- Grid dimensions must match the requirements of downstream components.
- Surface roughness assignments influence simulation behaviour.
- Cached geographic data must be kept consistent with its metadata.

The current pipeline uses NPZ files for cached geographic data, while parts of the C++ simulation interface use raw binary grid files. Conversion and alignment between these formats are important integration requirements.

## 11. Future Improvements

Potential improvements include:

- Improving the completeness of building and road datasets.
- Adding more detailed land-cover classification.
- Improving surface roughness estimation.
- Supporting additional geographic regions.
- Validating elevation data and generated grids.
- Improving consistency between NPZ and raw binary formats.
- Adding automated checks for coordinate systems and grid alignment.

---

**Project:** WETHAREPOT  
**Document:** Geospatial Pipeline Documentation  
**Purpose:** Describe geographic data acquisition, processing, and simulation-grid generation.