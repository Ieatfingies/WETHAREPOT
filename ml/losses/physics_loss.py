import torch
import torch.nn as nn
import torch.nn.functional as F


class CompositePhysicsLoss(nn.Module):
    """
    Composite Physics-Informed Objective for 2D Shallow Water Equations:
        L = λd Ldata + λh Ldepth + λm Lmass + λp Lmomentum + λb Lboundary
    """
    def __init__(
        self,
        dx_m: float = 10.0,
        dy_m: float = 10.0,
        dt_s: float = 60.0,
        gravity: float = 9.81,
        h_dry: float = 1e-4,
        lambda_data: float = 1.0,
        lambda_depth: float = 0.5,
        lambda_mass: float = 0.05,
        lambda_momentum: float = 0.01,
        lambda_boundary: float = 0.1,
        wet_weight: float = 3.0,
    ):
        super().__init__()
        self.dx = dx_m
        self.dy = dy_m
        self.dt = dt_s
        self.g = gravity
        self.h_dry = h_dry

        self.lambda_data = lambda_data
        self.lambda_depth = lambda_depth
        self.lambda_mass = lambda_mass
        self.lambda_momentum = lambda_momentum
        self.lambda_boundary = lambda_boundary
        self.wet_weight = wet_weight

    def forward(
        self,
        pred_norm: torch.Tensor,
        target_norm: torch.Tensor,
        x_raw: torch.Tensor,
        ym: torch.Tensor,
        ys: torch.Tensor,
    ):
        """
        Args:
            pred_norm: Normalized model prediction [B, 3, H, W]
            target_norm: Normalized ground truth [B, 3, H, W]
            x_raw: Physical input tensor [B, 7, H, W]:
                   0: DEM (z)
                   1: Building mask
                   2: Manning roughness
                   3: h_prev
                   4: u_prev
                   5: v_prev
                   6: rain_ms
            ym: Target channel means [3]
            ys: Target channel standard deviations [3]
        """
        B, _, H, W = pred_norm.shape

        # ----------------------------------------------------
        # 1. DATA LOSS with wet-cell weighting
        # ----------------------------------------------------
        err = F.smooth_l1_loss(pred_norm, target_norm, reduction="none")

        # Wet-cell mask from physical target depth
        target_h_phys = target_norm[:, 0:1] * ys[0] + ym[0]
        wet_mask = (target_h_phys > 0.05).float()
        weights = 1.0 + (self.wet_weight - 1.0) * wet_mask

        # Data loss weighted
        loss_data = (err * weights).mean()

        # ----------------------------------------------------
        # Denormalize predictions to physical units
        # ----------------------------------------------------
        pred_h = pred_norm[:, 0] * ys[0] + ym[0]
        pred_u = pred_norm[:, 1] * ys[1] + ym[1]
        pred_v = pred_norm[:, 2] * ys[2] + ym[2]

        dem = x_raw[:, 0]
        bld_mask = x_raw[:, 1]
        roughness = x_raw[:, 2]
        h_prev = x_raw[:, 3]
        u_prev = x_raw[:, 4]
        v_prev = x_raw[:, 5]
        rain_ms = x_raw[:, 6]

        fluid_mask = (bld_mask < 0.5).float()

        # ----------------------------------------------------
        # 2. DEPTH NON-NEGATIVITY LOSS
        # ----------------------------------------------------
        loss_depth = torch.relu(-pred_h).pow(2).mean()

        # Clamped positive depth for subsequent PDE terms
        h_pos = torch.relu(pred_h)
        wet_cells = (h_pos > self.h_dry).float() * fluid_mask

        # ----------------------------------------------------
        # 3. DISCRETE CONTINUITY (MASS RESIDUAL) LOSS
        #    dh/dt + d(hu)/dx + d(hv)/dy = R
        # ----------------------------------------------------
        # Rate of depth change
        dh_dt = (h_pos - h_prev) / self.dt

        # Discharges
        qx = h_pos * pred_u
        qy = h_pos * pred_v

        # Spatial flux gradients using central differences (interior cells)
        dqx_dx = torch.zeros_like(qx)
        dqy_dy = torch.zeros_like(qy)

        dqx_dx[:, :, 1:-1] = (qx[:, :, 2:] - qx[:, :, :-2]) / (2.0 * self.dx)
        dqy_dy[:, 1:-1, :] = (qy[:, 2:, :] - qy[:, :-2, :]) / (2.0 * self.dy)

        mass_res = (dh_dt + dqx_dx + dqy_dy - rain_ms) * fluid_mask
        loss_mass = mass_res.pow(2).mean()

        # ----------------------------------------------------
        # 4. 2D SHALLOW-WATER MOMENTUM RESIDUAL LOSS
        #    d(hu)/dt + d(hu^2)/dx + d(huv)/dy + gh * d(h+z)/dx + friction = 0
        # ----------------------------------------------------
        # Temporal momentum derivatives
        dhu_dt = (h_pos * pred_u - h_prev * u_prev) / self.dt
        dhv_dt = (h_pos * pred_v - h_prev * v_prev) / self.dt

        # Water surface elevation eta = h + z
        eta = h_pos + dem
        deta_dx = torch.zeros_like(eta)
        deta_dy = torch.zeros_like(eta)
        deta_dx[:, :, 1:-1] = (eta[:, :, 2:] - eta[:, :, :-2]) / (2.0 * self.dx)
        deta_dy[:, 1:-1, :] = (eta[:, 2:, :] - eta[:, :-2, :]) / (2.0 * self.dy)

        # Advective fluxes
        hu2 = h_pos * pred_u * pred_u
        hv2 = h_pos * pred_v * pred_v
        huv = h_pos * pred_u * pred_v

        dhu2_dx = torch.zeros_like(hu2)
        dhuv_dy = torch.zeros_like(huv)
        dhuv_dx = torch.zeros_like(huv)
        dhv2_dy = torch.zeros_like(hv2)

        dhu2_dx[:, :, 1:-1] = (hu2[:, :, 2:] - hu2[:, :, :-2]) / (2.0 * self.dx)
        dhuv_dy[:, 1:-1, :] = (huv[:, 2:, :] - huv[:, :-2, :]) / (2.0 * self.dy)
        dhuv_dx[:, :, 1:-1] = (huv[:, :, 2:] - huv[:, :, :-2]) / (2.0 * self.dx)
        dhv2_dy[:, 1:-1, :] = (hv2[:, 2:, :] - hv2[:, :-2, :]) / (2.0 * self.dy)

        # Manning friction
        speed = torch.sqrt(pred_u * pred_u + pred_v * pred_v + 1e-6)
        h_eff = torch.clamp(h_pos, min=0.01)
        friction_coeff = self.g * (roughness ** 2) * speed / (h_eff ** (4.0 / 3.0))
        friction_coeff = torch.clamp(friction_coeff, max=100.0)

        frict_u = friction_coeff * pred_u
        frict_v = friction_coeff * pred_v

        mom_u_res = (dhu_dt + dhu2_dx + dhuv_dy + self.g * h_pos * deta_dx + frict_u) * wet_cells
        mom_v_res = (dhv_dt + dhuv_dx + dhv2_dy + self.g * h_pos * deta_dy + frict_v) * wet_cells

        # Normalized momentum loss
        loss_mom = (mom_u_res.pow(2) + mom_v_res.pow(2)).mean()

        # ----------------------------------------------------
        # 5. BOUNDARY CONSTRAINT LOSS
        # ----------------------------------------------------
        # Water and velocity inside buildings must be zero
        bld_violation = (h_pos.pow(2) + pred_u.pow(2) + pred_v.pow(2)) * bld_mask
        loss_bld = bld_violation.mean()

        # Domain boundary wall normal velocity constraint
        wall_u = pred_u[:, :, 0].pow(2).mean() + pred_u[:, :, -1].pow(2).mean()
        wall_v = pred_v[:, 0, :].pow(2).mean() + pred_v[:, -1, :].pow(2).mean()
        loss_bnd = loss_bld + 0.5 * (wall_u + wall_v)

        # ----------------------------------------------------
        # TOTAL COMPOSITE LOSS
        # ----------------------------------------------------
        total_loss = (
            self.lambda_data * loss_data
            + self.lambda_depth * loss_depth
            + self.lambda_mass * loss_mass
            + self.lambda_momentum * loss_mom
            + self.lambda_boundary * loss_bnd
        )

        metrics = {
            "loss_total": total_loss.item(),
            "loss_data": loss_data.item(),
            "loss_depth": loss_depth.item(),
            "loss_mass": loss_mass.item(),
            "loss_momentum": loss_mom.item(),
            "loss_boundary": loss_bnd.item(),
        }

        return total_loss, metrics


def physics_informed_loss(pred, target, depth_mean, depth_std):
    """Backward compatibility wrapper for legacy baseline calls."""
    data_loss = F.smooth_l1_loss(pred, target)
    depth_m = pred[:, 0] * depth_std + depth_mean
    nonnegative_penalty = torch.relu(-depth_m).mean()
    total = data_loss + 0.1 * nonnegative_penalty
    return total, data_loss.detach(), nonnegative_penalty.detach()
