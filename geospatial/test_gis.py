import numpy as np
from geospatial.grid_generation.builder import build_region_grids

if __name__ == "__main__":
    npz_path = build_region_grids(region_id="bellandur", grid_size=256, resolution_m=10.0)
    data = np.load(npz_path)
    for k in data.files:
        arr = data[k]
        print(f"Layer '{k}': shape={arr.shape}, dtype={arr.dtype}, min={arr.min():.4f}, max={arr.max():.4f}")