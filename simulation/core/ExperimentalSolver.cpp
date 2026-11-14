#include "ExperimentalSolver.hpp"
#include <algorithm>
#include <cmath>
#include <iostream>

namespace wetharepot {

namespace {
struct Flux {
    float f_h;
    float f_hu;
    float f_hv;
};

inline Flux rusanovFlux(
    float hL, float uL, float vL,
    float hR, float uR, float vR,
    float nx, float ny, float g, float h_dry)
{
    if (hL < h_dry && hR < h_dry) {
        return {0.0f, 0.0f, 0.0f};
    }

    const float unL = uL * nx + vL * ny;
    const float unR = uR * nx + vR * ny;

    const float cL = std::sqrt(g * std::max(hL, 0.0f));
    const float cR = std::sqrt(g * std::max(hR, 0.0f));
    const float smax = std::max(std::abs(unL) + cL, std::abs(unR) + cR);

    const float pL = 0.5f * g * hL * hL;
    const float pR = 0.5f * g * hR * hR;

    const float fL_h  = hL * unL;
    const float fL_hu = hL * uL * unL + pL * nx;
    const float fL_hv = hL * vL * unL + pL * ny;

    const float fR_h  = hR * unR;
    const float fR_hu = hR * uR * unR + pR * nx;
    const float fR_hv = hR * vR * unR + pR * ny;

    const float qL_hu = hL * uL;
    const float qL_hv = hL * vL;
    const float qR_hu = hR * uR;
    const float qR_hv = hR * vR;

    return {
        0.5f * (fL_h  + fR_h)  - 0.5f * smax * (hR - hL),
        0.5f * (fL_hu + fR_hu) - 0.5f * smax * (qR_hu - qL_hu),
        0.5f * (fL_hv + fR_hv) - 0.5f * smax * (qR_hv - qL_hv)
    };
}
} // namespace

ExperimentalSolver::ExperimentalSolver(
    const SimulationConfig& cfg,
    BoundaryCondition bc
)
    : cfg_(cfg),
      boundary_cond_(bc),
      h_next_(static_cast<size_t>(cfg.grid.width) * cfg.grid.height, 0.0f),
      hu_next_(static_cast<size_t>(cfg.grid.width) * cfg.grid.height, 0.0f),
      hv_next_(static_cast<size_t>(cfg.grid.width) * cfg.grid.height, 0.0f) {}

void ExperimentalSolver::initMassBalance(const FloodState& state) {
    mass_balance_ = MassBalanceReport();
    mass_balance_.initial_volume_m3 = state.totalWaterVolumeM3();
    mass_balance_.current_volume_m3 = mass_balance_.initial_volume_m3;
    mass_balance_initialized_ = true;
}

float ExperimentalSolver::compute2DCflDt(const FloodState& state) const {
    const int W = state.spec.width;
    const int H = state.spec.height;
    const float dx = static_cast<float>(state.spec.dx_m);
    const float dy = static_cast<float>(state.spec.dy_m);
    const float g = cfg_.hydro.gravity;
    const float h_dry = cfg_.hydro.dry_threshold_m;
    const float cfl = cfg_.hydro.cfl_number;

    float min_dt = static_cast<float>(cfg_.max_dt_s);

    #pragma omp parallel for reduction(min:min_dt)
    for (int i = 0; i < W * H; ++i) {
        if (state.building_mask[i] > 0.5f) continue;
        const float h = state.h[i];
        if (h > h_dry) {
            const float c = std::sqrt(g * h);
            const float sx = std::abs(state.u[i]) + c;
            const float sy = std::abs(state.v[i]) + c;
            const float rate = (sx / dx) + (sy / dy);
            if (rate > 1e-6f) {
                const float dt_cell = cfl / rate;
                min_dt = std::min(min_dt, dt_cell);
            }
        }
    }
    return std::max(min_dt, 1e-4f);
}

double ExperimentalSolver::stepAdaptive(FloodState& state, double max_step_s) {
    if (!mass_balance_initialized_) {
        initMassBalance(state);
    }

    const int W = state.spec.width;
    const int H = state.spec.height;
    const float dx = static_cast<float>(state.spec.dx_m);
    const float dy = static_cast<float>(state.spec.dy_m);
    const float cell_area = dx * dy;
    const float g = cfg_.hydro.gravity;
    const float h_dry = cfg_.hydro.dry_threshold_m;

    float dt = compute2DCflDt(state);
    if (max_step_s > 0.0 && static_cast<double>(dt) > max_step_s) {
        dt = static_cast<float>(max_step_s);
    }

    const float uniform_net_rain = cfg_.hydro.rainfall_rate_ms - cfg_.hydro.infiltration_rate_ms;
    const bool use_grid_rain = (rain_grid_ms_.size() == static_cast<size_t>(W * H));
    const float infil_rate = cfg_.hydro.infiltration_rate_ms;

    double step_boundary_outflow_m3 = 0.0;
    double step_boundary_inflow_m3 = 0.0;
    double step_rain_volume_m3 = 0.0;

    #pragma omp parallel for collapse(2) reduction(+:step_boundary_outflow_m3, step_boundary_inflow_m3, step_rain_volume_m3)
    for (int y = 0; y < H; ++y) {
        for (int x = 0; x < W; ++x) {
            const size_t c = state.idx(x, y);

            if (state.building_mask[c] > 0.5f) {
                h_next_[c] = 0.0f;
                hu_next_[c] = 0.0f;
                hv_next_[c] = 0.0f;
                continue;
            }

            const float cell_net_rain = use_grid_rain ? (rain_grid_ms_[c] - infil_rate) : uniform_net_rain;
            step_rain_volume_m3 += static_cast<double>(cell_net_rain) * static_cast<double>(dt) * static_cast<double>(cell_area);

            const float hC = state.h[c];
            const float uC = state.u[c];
            const float vC = state.v[c];
            const float zC = state.dem[c];
            const float etaC = hC + zC;

            auto sampleNeighbor = [&](int nx_idx, int ny_idx, float nx, float ny,
                                     float& hN, float& uN, float& vN, float& zN, bool& solid) {
                // Domain boundaries
                if (nx_idx < 0 || nx_idx >= W || ny_idx < 0 || ny_idx >= H) {
                    if (boundary_cond_ == BoundaryCondition::CLOSED) {
                        solid = true;
                    } else if (boundary_cond_ == BoundaryCondition::OPEN_NO_INFLOW) {
                        // Neumann for outflow, but strictly no inflow
                        solid = false;
                        const float unC = uC * nx + vC * ny;
                        if (unC > 0.0f) {
                            hN = hC;
                            uN = uC;
                            vN = vC;
                            zN = zC;
                        } else {
                            // Inflow prevention: reflect normal velocity like a wall
                            solid = true;
                        }
                    } else if (boundary_cond_ == BoundaryCondition::CONTROLLED_OUTFLOW) {
                        // Critical depth / free overfall outflow
                        solid = false;
                        hN = 0.0f;
                        const float c_crit = std::sqrt(g * std::max(hC, 0.0f));
                        uN = c_crit * nx;
                        vN = c_crit * ny;
                        zN = zC;
                    }
                    return;
                }

                // Building obstacle boundaries
                const size_t n_idx = state.idx(nx_idx, ny_idx);
                if (state.building_mask[n_idx] > 0.5f) {
                    solid = true;
                    return;
                }

                solid = false;
                hN = state.h[n_idx];
                uN = state.u[n_idx];
                vN = state.v[n_idx];
                zN = state.dem[n_idx];
            };

            auto computeInterfaceFlux = [&](int nx_idx, int ny_idx, float nx, float ny,
                                            float face_len, bool is_domain_bnd,
                                            float& bed_source) -> Flux {
                float hN = 0.0f, uN = 0.0f, vN = 0.0f, zN = 0.0f;
                bool solid = false;
                sampleNeighbor(nx_idx, ny_idx, nx, ny, hN, uN, vN, zN, solid);

                if (solid) {
                    const float un = uC * nx + vC * ny;
                    const float u_refl = uC - 2.0f * un * nx;
                    const float v_refl = vC - 2.0f * un * ny;
                    bed_source = 0.0f;
                    return rusanovFlux(hC, uC, vC, hC, u_refl, v_refl, nx, ny, g, h_dry);
                }

                const float etaN = hN + zN;
                const float z_star = std::max(zC, zN);
                const float hC_star = std::max(0.0f, etaC - z_star);
                const float hN_star = std::max(0.0f, etaN - z_star);

                bed_source = 0.5f * g * (hC_star * hC_star - hC * hC);
                Flux flx = rusanovFlux(hC_star, uC, vC, hN_star, uN, vN, nx, ny, g, h_dry);

                if (is_domain_bnd) {
                    if (flx.f_h > 0.0f) {
                        step_boundary_outflow_m3 += static_cast<double>(flx.f_h) * face_len * dt;
                    } else if (flx.f_h < 0.0f) {
                        step_boundary_inflow_m3 += static_cast<double>(-flx.f_h) * face_len * dt;
                    }
                }
                return flx;
            };

            float src_E = 0.0f, src_W = 0.0f, src_N = 0.0f, src_S = 0.0f;
            Flux fE = computeInterfaceFlux(x + 1, y,  1.0f,  0.0f, dy, (x == W - 1), src_E);
            Flux fW = computeInterfaceFlux(x - 1, y, -1.0f,  0.0f, dy, (x == 0),     src_W);
            Flux fN = computeInterfaceFlux(x, y - 1,  0.0f, -1.0f, dx, (y == 0),     src_N);
            Flux fS = computeInterfaceFlux(x, y + 1,  0.0f,  1.0f, dx, (y == H - 1), src_S);

            float h_new = hC - (dt / dx) * (fE.f_h + fW.f_h) - (dt / dy) * (fN.f_h + fS.f_h) + dt * cell_net_rain;
            h_new = std::max(0.0f, h_new);

            if (h_new <= h_dry) {
                h_next_[c] = h_new;
                hu_next_[c] = 0.0f;
                hv_next_[c] = 0.0f;
                continue;
            }

            float hu_new = hC * uC
                - (dt / dx) * (fE.f_hu + fW.f_hu - (src_E - src_W))
                - (dt / dy) * (fN.f_hu + fS.f_hu);

            float hv_new = hC * vC
                - (dt / dx) * (fE.f_hv + fW.f_hv)
                - (dt / dy) * (fN.f_hv + fS.f_hv - (src_S - src_N));

            const float n_manning = state.roughness[c];
            const float u_tmp = hu_new / h_new;
            const float v_tmp = hv_new / h_new;
            const float speed = std::sqrt(u_tmp * u_tmp + v_tmp * v_tmp);
            const float denom = 1.0f + dt * g * n_manning * n_manning * speed / std::pow(h_new, 4.0f / 3.0f);

            h_next_[c] = h_new;
            hu_next_[c] = hu_new / denom;
            hv_next_[c] = hv_new / denom;
        }
    }

    #pragma omp parallel for
    for (int i = 0; i < W * H; ++i) {
        state.h[i] = h_next_[i];
        if (h_next_[i] > h_dry) {
            state.u[i] = hu_next_[i] / h_next_[i];
            state.v[i] = hv_next_[i] / h_next_[i];
        } else {
            state.u[i] = 0.0f;
            state.v[i] = 0.0f;
        }
    }

    state.sim_time_s += static_cast<double>(dt);
    state.step_count += 1;

    mass_balance_.rain_volume_m3 += step_rain_volume_m3;
    mass_balance_.boundary_outflow_m3 += step_boundary_outflow_m3;
    mass_balance_.boundary_inflow_m3 += step_boundary_inflow_m3;
    mass_balance_.current_volume_m3 = state.totalWaterVolumeM3();

    return static_cast<double>(dt);
}

void ExperimentalSolver::advanceTo(FloodState& state, double target_time_s) {
    while (state.sim_time_s < target_time_s - 1e-7) {
        const double rem = target_time_s - state.sim_time_s;
        stepAdaptive(state, rem);
    }
}

} // namespace wetharepot
