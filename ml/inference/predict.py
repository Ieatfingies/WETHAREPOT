import numpy as np
import torch

from ml.models import get_model


def rollout_surrogate(
    dem,
    building_mask,
    roughness,
    rain_mmhr,
    duration_min,
    weights_path,
):
    device = torch.device(
        "mps" if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available()
        else "cpu"
    )

    checkpoint = torch.load(weights_path, map_location=device, weights_only=False)
    model_name = checkpoint.get("model_name", "unet_base16")
    base_channels = checkpoint.get("base_channels", 16)
    in_c = checkpoint.get("input_channels", 7)
    out_c = checkpoint.get("output_channels", 3)

    model = get_model(model_name, in_channels=in_c, out_channels=out_c, base=base_channels).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    dem = np.asarray(dem, dtype=np.float32)
    mask = np.asarray(building_mask, dtype=np.float32)
    rough = np.asarray(roughness, dtype=np.float32)

    h = np.zeros_like(dem)
    u = np.zeros_like(dem)
    v = np.zeros_like(dem)
    rain = np.full_like(dem, rain_mmhr / 3_600_000.0)

    xm = np.asarray(checkpoint["x_mean"], dtype=np.float32)[:, None, None]
    xs = np.asarray(checkpoint["x_std"], dtype=np.float32)[:, None, None]
    ym = np.asarray(checkpoint["y_mean"], dtype=np.float32)[:, None, None]
    ys = np.asarray(checkpoint["y_std"], dtype=np.float32)[:, None, None]

    static = [dem, mask, rough]
    frames = []
    steps = max(1, int(np.ceil(duration_min * 60.0 / 60.0)))

    with torch.no_grad():
        for _ in range(steps):
            x = np.stack(static + [h, u, v, rain], axis=0)
            x = (x - xm) / xs
            tensor = torch.from_numpy(x[None].copy()).to(device)

            pred = model(tensor).cpu().numpy()[0]
            pred = pred * ys + ym

            h = np.maximum(pred[0], 0.0).astype(np.float32)
            u = pred[1].astype(np.float32)
            v = pred[2].astype(np.float32)

            # Buildings are excluded from the water state.
            h[mask > 0.5] = 0.0
            u[mask > 0.5] = 0.0
            v[mask > 0.5] = 0.0

            frames.append(h.copy())

    return frames
