import os
import subprocess
import numpy as np

npz_path = "data/processed/bellandur_256.npz"
sim_in = "data/processed/sim_bellandur_in"
sim_out = "data/processed/sim_bellandur_out"
os.makedirs(sim_in, exist_ok=True)
os.makedirs(sim_out, exist_ok=True)

data = np.load(npz_path)
data["dem"].astype(np.float32).tofile(f"{sim_in}/dem.bin")
data["building_mask"].astype(np.float32).tofile(f"{sim_in}/mask.bin")
data["roughness"].astype(np.float32).tofile(f"{sim_in}/rough.bin")

cmd = [
    "build/swe_solver.exe",
    sim_in,
    sim_out,
    "256",
    "10.0",
    "80.0",    # 80 mm/hr heavy monsoon cloudburst
    "1800.0",  # 30 minutes simulated time
    "300.0",   # save every 5 minutes (6 frames)
]
subprocess.run(cmd, check=True)

h_final = np.fromfile(f"{sim_out}/frame_0005_h.bin", dtype=np.float32).reshape(256, 256)
print(f"Final Bellandur Water Depth -> max: {h_final.max():.3f} m | mean: {h_final.mean():.4f} m | flooded cells (>5cm): {(h_final > 0.05).sum()}")