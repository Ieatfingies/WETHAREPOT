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
from ml.training.dataset import FloodDataset, compute_statistics
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
    grad_clip=1.0,
    rollout_steps=1,
    xs_t=None,
    xm_t=None,
):
    model.train()
    total_loss = 0.0
    total_data_loss = 0.0
    total_mass_loss = 0.0
    total_mom_loss = 0.0

    for x_norm, y_norm, x_raw in loader:
        x_norm = x_norm.to(device)
        y_norm = y_norm.to(device)
        x_raw = x_raw.to(device)

        optimizer.zero_grad(set_to_none=True)

        if rollout_steps == 1:
            pred_norm = model(x_norm)
            if loss_mode == "composite":
                loss, metrics = loss_fn(pred_norm, y_norm, x_raw, ym_t, ys_t)
                total_data_loss += metrics["loss_data"]
                total_mass_loss += metrics["loss_mass"]
                total_mom_loss += metrics["loss_momentum"]
            elif loss_mode == "legacy":
                loss, data_loss, _ = physics_informed_loss(pred_norm, y_norm, ym_t[0], ys_t[0])
                total_data_loss += data_loss.item()
            else:  # data_only
                loss = nn.functional.smooth_l1_loss(pred_norm, y_norm)
                total_data_loss += loss.item()
        else:
            # 2-step autoregressive unroll during training
            pred_1 = model(x_norm)
            loss_1, _ = loss_fn(pred_1, y_norm, x_raw, ym_t, ys_t) if loss_mode == "composite" else (
                nn.functional.smooth_l1_loss(pred_1, y_norm), {}
            )
            loss = loss_1
            total_data_loss += loss_1.item()

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
        "train_mom_loss": total_mom_loss / n,
    }


def validate(model, loader, device, loss_mode, loss_fn, ym_t, ys_t):
    model.eval()
    total_loss = 0.0
    total_data_loss = 0.0
    total_mass_loss = 0.0

    with torch.no_grad():
        for x_norm, y_norm, x_raw in loader:
            x_norm = x_norm.to(device)
            y_norm = y_norm.to(device)
            x_raw = x_raw.to(device)

            pred_norm = model(x_norm)

            if loss_mode == "composite":
                loss, metrics = loss_fn(pred_norm, y_norm, x_raw, ym_t, ys_t)
                total_data_loss += metrics["loss_data"]
                total_mass_loss += metrics["loss_mass"]
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
        "val_mass_loss": total_mass_loss / n,
    }


def run_experiment(
    model_name: str = "unet_base16",
    loss_mode: str = "composite",
    epochs: int = 10,
    batch_size: int = 8,
    lr: float = 1e-3,
    patience: int = 4,
    dataset_dir: str = "data/processed/dataset_experimental",
    exp_name: str = None,
    seed: int = 42,
    lambda_mass: float = 0.05,
    lambda_mom: float = 0.01,
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
    print(f"Epochs: {epochs} | Batch Size: {batch_size} | LR: {lr}")
    print(f"=======================================================")

    root = Path(dataset_dir)
    train_files = sorted((root / "train").glob("*.npz"))
    val_files = sorted((root / "val").glob("*.npz"))

    if not train_files or not val_files:
        raise RuntimeError(f"Missing data in {dataset_dir}")

    print("Computing channel statistics on training split...")
    xm, xs, ym, ys = compute_statistics(train_files)

    train_ds = FloodDataset(train_files, xm, xs, ym, ys, return_raw=True)
    val_ds = FloodDataset(val_files, xm, xs, ym, ys, return_raw=True)

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True, num_workers=0
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False, num_workers=0
    )

    base_c = 32 if "base32" in model_name else 16
    model = get_model(model_name, in_channels=7, out_channels=3, base=base_c).to(device)

    total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Model trainable parameters: {total_params:,}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-5)

    loss_fn = CompositePhysicsLoss(
        lambda_mass=lambda_mass,
        lambda_momentum=lambda_mom,
    ).to(device)

    ym_t = torch.tensor(ym, device=device, dtype=torch.float32)
    ys_t = torch.tensor(ys, device=device, dtype=torch.float32)
    xm_t = torch.tensor(xm, device=device, dtype=torch.float32)
    xs_t = torch.tensor(xs, device=device, dtype=torch.float32)

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
            loss_mode, loss_fn, ym_t, ys_t, grad_clip=1.0,
            rollout_steps=1, xs_t=xs_t, xm_t=xm_t
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
    parser.add_argument("--model", type=str, default="unet_base16",
                        choices=["unet_base16", "unet_base32", "res_unet", "multiscale_res_unet"])
    parser.add_argument("--loss", type=str, default="composite",
                        choices=["data_only", "legacy", "composite"])
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--patience", type=int, default=4)
    parser.add_argument("--exp-name", type=str, default=None)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    run_experiment(
        model_name=args.model,
        loss_mode=args.loss,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        patience=args.patience,
        exp_name=args.exp_name,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
