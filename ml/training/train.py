import argparse
import random
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from ml.models.unet import UNet
from ml.training.dataset import FloodDataset, compute_statistics
from ml.losses.physics_loss import physics_informed_loss


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-3)
    args = parser.parse_args()

    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)

    root = Path("data/processed/dataset")
    train_files = sorted((root / "train").glob("*.npz"))
    val_files = sorted((root / "val").glob("*.npz"))

    if not train_files or not val_files:
        raise RuntimeError("Training or validation dataset is empty.")

    print(f"Training samples: {len(train_files)}")
    print(f"Validation samples: {len(val_files)}")

    device = torch.device(
        "mps" if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available()
        else "cpu"
    )
    print("Training device:", device)

    print("Computing channel normalization statistics...")
    xm, xs, ym, ys = compute_statistics(train_files)
    print("Input means:", xm)
    print("Target means:", ym)
    print("Target standard deviations:", ys)

    train_ds = FloodDataset(train_files, xm, xs, ym, ys)
    val_ds = FloodDataset(val_files, xm, xs, ym, ys)

    train_loader = DataLoader(
        train_ds, batch_size=args.batch_size, shuffle=True, num_workers=0
    )
    val_loader = DataLoader(
        val_ds, batch_size=args.batch_size, shuffle=False, num_workers=0
    )

    model = UNet().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)

    depth_mean = torch.tensor(float(ym[0]), device=device)
    depth_std = torch.tensor(float(ys[0]), device=device)

    weights_dir = Path("ml/weights")
    weights_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = weights_dir / "unet_flood.pth"

    best_val = float("inf")

    for epoch in range(args.epochs):
        model.train()
        train_total = 0.0

        for batch_idx, (x, y) in enumerate(train_loader):
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad(set_to_none=True)

            pred = model(x)
            loss, data_loss, physics_loss = physics_informed_loss(
                pred, y, depth_mean, depth_std
            )

            if not torch.isfinite(loss):
                raise RuntimeError("Non-finite training loss detected.")

            loss.backward()
            optimizer.step()
            train_total += loss.item()

            if (batch_idx + 1) % 10 == 0:
                print(
                    f"Epoch {epoch+1} | Batch {batch_idx+1}/{len(train_loader)} "
                    f"| Loss {loss.item():.6f}"
                )

        model.eval()
        val_total = 0.0

        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(device), y.to(device)
                pred = model(x)
                loss, _, _ = physics_informed_loss(
                    pred, y, depth_mean, depth_std
                )
                val_total += loss.item()

        train_avg = train_total / len(train_loader)
        val_avg = val_total / len(val_loader)

        print(
            f"Epoch {epoch+1}/{args.epochs} "
            f"| Train loss: {train_avg:.6f} "
            f"| Validation loss: {val_avg:.6f}"
        )

        if val_avg < best_val:
            best_val = val_avg
            torch.save({
                "model_state_dict": model.state_dict(),
                "x_mean": xm,
                "x_std": xs,
                "y_mean": ym,
                "y_std": ys,
                "base_channels": 16,
                "input_channels": 7,
                "output_channels": 3,
                "validation_loss": best_val,
                "epoch": epoch + 1,
            }, checkpoint_path)
            print("Saved checkpoint:", checkpoint_path)

    print("Training finished.")
    print("Best validation loss:", best_val)
    print("Checkpoint:", checkpoint_path)


if __name__ == "__main__":
    main()
