import argparse
import json
import os
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from ml.models import get_model
from ml.training.dataset import (
    FloodDataset,
    PairedFloodDataset,
    TripletFloodDataset,
    compute_statistics,
)
from ml.losses.physics_loss import CompositePhysicsLoss, physics_informed_loss


def set_seed(seed: int = 42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def train_epoch(
    model,
    loader,
    optimizer,
    scheduler,
    device,
    loss_mode,
    loss_fn,
    ym_t,
    ys_t,
    xm_t,
    xs_t,
    grad_clip=1.0,
    scheduled_sampling_rate=0.20,
):
    model.train()
    total_loss = 0.0
    total_data_loss = 0.0
    total_mass_loss = 0.0
    total_vol_loss = 0.0

    for batch in loader:
        if len(batch) == 7:
            x1_norm, y1_norm, x1_raw, y2_norm, x2_raw, y3_norm, x3_raw = batch
            x1_norm = x1_norm.to(device)
            y1_norm = y1_norm.to(device)
            x1_raw = x1_raw.to(device)
            y2_norm = y2_norm.to(device)
            x2_raw = x2_raw.to(device)
            y3_norm = y3_norm.to(device)
            x3_raw = x3_raw.to(device)
        elif len(batch) == 5:
            x1_norm, y1_norm, x1_raw, y2_norm, x2_raw = batch
            x1_norm = x1_norm.to(device)
            y1_norm = y1_norm.to(device)
            x1_raw = x1_raw.to(device)
            y2_norm = y2_norm.to(device)
            x2_raw = x2_raw.to(device)
            y3_norm, x3_raw = None, None
        else:
            x1_norm, y1_norm, x1_raw = batch
            x1_norm = x1_norm.to(device)
            y1_norm = y1_norm.to(device)
            x1_raw = x1_raw.to(device)
            y2_norm, x2_raw = None, None
            y3_norm, x3_raw = None, None

        optimizer.zero_grad(set_to_none=True)

        # Step 1 prediction
        pred1_norm = model(x1_norm)

        if loss_mode == "composite":
            loss1, metrics1 = loss_fn(pred1_norm, y1_norm, x1_raw, ym_t, ys_t)
            total_data_loss += metrics1["loss_data"]
            total_mass_loss += metrics1["loss_mass"]
            total_vol_loss += metrics1.get("loss_vol", 0.0)
        elif loss_mode == "legacy":
            loss1, data_loss, _ = physics_informed_loss(pred1_norm, y1_norm, ym_t[0], ys_t[0])
            total_data_loss += data_loss.item()
        else:
            loss1 = nn.functional.smooth_l1_loss(pred1_norm, y1_norm)
            total_data_loss += loss1.item()

        loss = loss1

        # Scheduled sampling (Step 2 and Step 3 autoregressive unroll during training)
        if y2_norm is not None and random.random() < scheduled_sampling_rate:
            # Denormalize step 1 to physical units
            pred1_h = torch.relu(pred1_norm[:, 0] * ys_t[0] + ym_t[0])
            pred1_u = pred1_norm[:, 1] * ys_t[1] + ym_t[1]
            pred1_v = pred1_norm[:, 2] * ys_t[2] + ym_t[2]

            # Physical boundary constraints
            bld_mask = x1_raw[:, 1]
            pred1_h = pred1_h * (bld_mask < 0.5).float()
            pred1_u = pred1_u * (bld_mask < 0.5).float()
            pred1_v = pred1_v * (bld_mask < 0.5).float()

            # Dry cell velocities set to 0
            wet1 = (pred1_h > 1e-4).float()
            pred1_u = pred1_u * wet1
            pred1_v = pred1_v * wet1

            # Construct physical input for step 2: [dem, mask, rough, h, u, v, rain]
            static_ch = x1_raw[:, :3]  # [dem, mask, rough]
            rain_ch = x1_raw[:, 6:7]   # [rain]
            dynamic_ch1 = torch.stack([pred1_h, pred1_u, pred1_v], dim=1)
            x2_sim_raw = torch.cat([static_ch, dynamic_ch1, rain_ch], dim=1)
            x2_sim_norm = (x2_sim_raw - xm_t) / xs_t

            pred2_norm = model(x2_sim_norm)
            if loss_mode == "composite":
                loss2, _ = loss_fn(pred2_norm, y2_norm, x2_raw, ym_t, ys_t)
            else:
                loss2 = nn.functional.smooth_l1_loss(pred2_norm, y2_norm)

            loss = loss1 + 0.5 * loss2

            # Progressive 3-step rollout if triplet batch is available
            if y3_norm is not None:
                pred2_h = torch.relu(pred2_norm[:, 0] * ys_t[0] + ym_t[0])
                pred2_u = pred2_norm[:, 1] * ys_t[1] + ym_t[1]
                pred2_v = pred2_norm[:, 2] * ys_t[2] + ym_t[2]

                pred2_h = pred2_h * (bld_mask < 0.5).float()
                pred2_u = pred2_u * (bld_mask < 0.5).float()
                pred2_v = pred2_v * (bld_mask < 0.5).float()

                wet2 = (pred2_h > 1e-4).float()
                pred2_u = pred2_u * wet2
                pred2_v = pred2_v * wet2

                dynamic_ch2 = torch.stack([pred2_h, pred2_u, pred2_v], dim=1)
                x3_sim_raw = torch.cat([static_ch, dynamic_ch2, rain_ch], dim=1)
                x3_sim_norm = (x3_sim_raw - xm_t) / xs_t

                pred3_norm = model(x3_sim_norm)
                if loss_mode == "composite":
                    loss3, _ = loss_fn(pred3_norm, y3_norm, x3_raw, ym_t, ys_t)
                else:
                    loss3 = nn.functional.smooth_l1_loss(pred3_norm, y3_norm)

                loss = loss + 0.25 * loss3

        if not torch.isfinite(loss):
            raise RuntimeError("Non-finite training loss detected.")

        loss.backward()
        if grad_clip > 0:
            torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)

        optimizer.step()
        total_loss += loss.item()

    if scheduler is not None:
        scheduler.step()

    n = max(1, len(loader))
    return {
        "train_loss": total_loss / n,
        "train_data_loss": total_data_loss / n,
        "train_mass_loss": total_mass_loss / n,
        "train_vol_loss": total_vol_loss / n,
    }


def validate(model, loader, device, loss_mode, loss_fn, ym_t, ys_t):
    model.eval()
    total_loss = 0.0
    total_data_loss = 0.0
    total_vol_loss = 0.0

    with torch.no_grad():
        for batch in loader:
            if len(batch) == 5:
                x_norm, y_norm, x_raw, _, _ = batch
            else:
                x_norm, y_norm, x_raw = batch

            x_norm = x_norm.to(device)
            y_norm = y_norm.to(device)
            x_raw = x_raw.to(device)

            pred_norm = model(x_norm)

            if loss_mode == "composite":
                loss, metrics = loss_fn(pred_norm, y_norm, x_raw, ym_t, ys_t)
                total_data_loss += metrics["loss_data"]
                total_vol_loss += metrics.get("loss_vol", 0.0)
            elif loss_mode == "legacy":
                loss, data_loss, _ = physics_informed_loss(pred_norm, y_norm, ym_t[0], ys_t[0])
                total_data_loss += data_loss.item()
            else:
                loss = nn.functional.smooth_l1_loss(pred_norm, y_norm)
                total_data_loss += loss.item()

            total_loss += loss.item()

    n = max(1, len(loader))
    return {
        "val_loss": total_loss / n,
        "val_data_loss": total_data_loss / n,
        "val_vol_loss": total_vol_loss / n,
    }


def run_experiment(
    model_name: str = "multiscale_res_unet",
    loss_mode: str = "composite",
    epochs: int = 12,
    batch_size: int = 8,
    lr: float = 1e-3,
    patience: int = 4,
    dataset_dir: str = "data/processed/dataset_clean",
    exp_name: str = None,
    seed: int = 42,
    scheduled_sampling_rate: float = 0.20,
    use_triplets: bool = False,
    include_spatial_rain: bool = False,
    init_weights: str = None,
):
    set_seed(seed)
    if exp_name is None:
        exp_name = f"{model_name}_{loss_mode}"

    device = torch.device(
        "mps" if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available()
        else "cpu"
    )
    print(f"\n=======================================================")
    print(f"Starting Experiment: {exp_name}")
    print(f"Model: {model_name} | Loss Mode: {loss_mode} | Device: {device}")
    print(f"Dataset: {dataset_dir} | Spatial Rain: {include_spatial_rain} | Triplets: {use_triplets}")
    print(f"Epochs: {epochs} | Batch Size: {batch_size} | LR: {lr} | Warm-start: {init_weights}")
    print(f"=======================================================")

    root = Path(dataset_dir)
    train_files = sorted((root / "train").glob("*.npz"))
    val_files = sorted((root / "val").glob("*.npz"))
    train_dirs = [root / "train"]

    if include_spatial_rain:
        spatial_train_dir = root / "train_spatial_rain"
        spatial_val_dir = root / "val_spatial_rain"
        if spatial_train_dir.is_dir():
            sp_train = sorted(spatial_train_dir.glob("*.npz"))
            train_files.extend(sp_train)
            train_dirs.append(spatial_train_dir)
            print(f"Appended {len(sp_train)} spatial rainfall training samples")
        if spatial_val_dir.is_dir():
            sp_val = sorted(spatial_val_dir.glob("*.npz"))
            val_files.extend(sp_val)
            print(f"Appended {len(sp_val)} spatial rainfall validation samples")

    if not train_files or not val_files:
        raise RuntimeError(f"Missing data in {dataset_dir}")

    print("Computing channel statistics on clean training split...")
    xm, xs, ym, ys = compute_statistics(train_files)
    print(f"Target depth mean: {ym[0]:.5f} m | std: {ys[0]:.5f} m")

    # Use triplet or paired dataset for scheduled sampling on training set
    if use_triplets:
        train_ds = TripletFloodDataset(train_dirs, xm, xs, ym, ys)
    else:
        train_ds = PairedFloodDataset(train_dirs, xm, xs, ym, ys)
    val_ds = FloodDataset(val_files, xm, xs, ym, ys, return_raw=True)

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True, num_workers=0
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False, num_workers=0
    )

    base_c = 32 if "base32" in model_name else 16
    model = get_model(model_name, in_channels=7, out_channels=3, base=base_c).to(device)

    if init_weights and os.path.isfile(init_weights):
        ckpt = torch.load(init_weights, map_location=device, weights_only=False)
        state_dict = ckpt["model_state_dict"] if "model_state_dict" in ckpt else ckpt
        model.load_state_dict(state_dict)
        print(f"Successfully loaded warm-start weights from {init_weights}")

    total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Model trainable parameters: {total_params:,}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-5)

    loss_fn = CompositePhysicsLoss().to(device)

    ym_t = torch.tensor(ym, device=device, dtype=torch.float32)
    ys_t = torch.tensor(ys, device=device, dtype=torch.float32)
    xm_t = torch.tensor(xm, device=device, dtype=torch.float32).view(1, 7, 1, 1)
    xs_t = torch.tensor(xs, device=device, dtype=torch.float32).view(1, 7, 1, 1)

    weights_dir = Path("ml/weights")
    weights_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = weights_dir / f"{exp_name}.pth"

    logs_dir = Path("ml/training/logs")
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_path = logs_dir / f"{exp_name}.json"

    best_val_loss = float("inf")
    no_improve_epochs = 0
    history = []

    for epoch in range(1, epochs + 1):
        tr_res = train_epoch(
            model, train_loader, optimizer, scheduler, device,
            loss_mode, loss_fn, ym_t, ys_t, xm_t, xs_t,
            grad_clip=1.0,
            scheduled_sampling_rate=scheduled_sampling_rate,
        )
        val_res = validate(model, val_loader, device, loss_mode, loss_fn, ym_t, ys_t)

        val_loss = val_res["val_loss"]
        val_data = val_res["val_data_loss"]

        record = {
            "epoch": epoch,
            "lr": optimizer.param_groups[0]["lr"],
            **tr_res,
            **val_res,
        }
        history.append(record)

        print(
            f"Epoch {epoch:02d}/{epochs:02d} | "
            f"Train Loss: {tr_res['train_loss']:.5f} (Data: {tr_res['train_data_loss']:.5f}) | "
            f"Val Loss: {val_loss:.5f} (Data: {val_data:.5f})"
        )

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            no_improve_epochs = 0
            torch.save({
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "scheduler_state_dict": scheduler.state_dict(),
                "model_name": model_name,
                "base_channels": base_c,
                "input_channels": 7,
                "output_channels": 3,
                "x_mean": xm,
                "x_std": xs,
                "y_mean": ym,
                "y_std": ys,
                "best_val_loss": best_val_loss,
                "best_epoch": epoch,
                "seed": seed,
                "loss_mode": loss_mode,
                "parameters_count": total_params,
            }, checkpoint_path)
            print(f"  --> Saved new best checkpoint to {checkpoint_path}")
        else:
            no_improve_epochs += 1
            if no_improve_epochs >= patience:
                print(f"Early stopping triggered after {epoch} epochs (patience={patience}).")
                break

    with open(log_path, "w") as f:
        json.dump({
            "exp_name": exp_name,
            "model_name": model_name,
            "loss_mode": loss_mode,
            "best_val_loss": best_val_loss,
            "total_params": total_params,
            "history": history,
        }, f, indent=2)

    print(f"Experiment {exp_name} completed. Best Val Loss: {best_val_loss:.6f}")
    return checkpoint_path, best_val_loss


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, default="multiscale_res_unet",
                        choices=["unet_base16", "unet_base32", "res_unet", "multiscale_res_unet"])
    parser.add_argument("--loss", type=str, default="composite",
                        choices=["data_only", "legacy", "composite"])
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--patience", type=int, default=4)
    parser.add_argument("--dataset-dir", type=str, default="data/processed/dataset_clean")
    parser.add_argument("--exp-name", type=str, default=None)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--scheduled-sampling", type=float, default=0.20)
    parser.add_argument("--use-triplets", action="store_true")
    parser.add_argument("--include-spatial-rain", action="store_true")
    parser.add_argument("--init-weights", type=str, default=None)
    args = parser.parse_args()

    run_experiment(
        model_name=args.model,
        loss_mode=args.loss,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        patience=args.patience,
        dataset_dir=args.dataset_dir,
        exp_name=args.exp_name,
        seed=args.seed,
        scheduled_sampling_rate=args.scheduled_sampling,
        use_triplets=args.use_triplets,
        include_spatial_rain=args.include_spatial_rain,
        init_weights=args.init_weights,
    )


if __name__ == "__main__":
    main()
