import torch
import torch.nn.functional as F


def physics_informed_loss(pred, target, depth_mean, depth_std):
    data_loss = F.smooth_l1_loss(pred, target)

    # Convert predicted depth back to metres before enforcing non-negativity.
    depth_m = pred[:, 0] * depth_std + depth_mean
    nonnegative_penalty = torch.relu(-depth_m).mean()

    total = data_loss + 0.1 * nonnegative_penalty
    return total, data_loss.detach(), nonnegative_penalty.detach()
