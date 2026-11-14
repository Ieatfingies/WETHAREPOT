#include "config.hpp"
#include "FloodState.hpp"
#include "ExperimentalSolver.hpp"
#include <iostream>
#include <cmath>
#include <cassert>
#include <iomanip>

using namespace wetharepot;

void test_lake_at_rest() {
    std::cout << "--- [TEST 1] Lake at Rest over Uneven Bathymetry ---\n";
    SimulationConfig cfg;
    cfg.grid.width = 64;
    cfg.grid.height = 64;
    cfg.grid.dx_m = 1.0;
    cfg.grid.dy_m = 1.0;
    cfg.hydro.gravity = 9.81f;
    cfg.hydro.rainfall_rate_ms = 0.0f;

    FloodState state(cfg.grid);
    const float eta_rest = 5.0f;

    for (int y = 0; y < cfg.grid.height; ++y) {
        for (int x = 0; x < cfg.grid.width; ++x) {
            size_t idx = state.idx(x, y);
            // Non-trivial bed elevation with bump
            float r2 = std::pow(x - 32.0f, 2) + std::pow(y - 32.0f, 2);
            float z = 1.0f + 1.5f * std::exp(-r2 / 50.0f);
            state.dem[idx] = z;
            state.h[idx] = eta_rest - z;
            state.u[idx] = 0.0f;
            state.v[idx] = 0.0f;
            state.roughness[idx] = 0.03f;
        }
    }

    ExperimentalSolver solver(cfg, BoundaryCondition::CLOSED);
    solver.advanceTo(state, 10.0); // simulate 10 seconds

    float max_speed = 0.0f;
    float max_eta_err = 0.0f;
    for (size_t i = 0; i < state.h.size(); ++i) {
        float speed = std::sqrt(state.u[i] * state.u[i] + state.v[i] * state.v[i]);
        max_speed = std::max(max_speed, speed);
        float eta = state.h[i] + state.dem[i];
        max_eta_err = std::max(max_eta_err, std::abs(eta - eta_rest));
    }

    std::cout << "  Simulated 10.0s | Max speed: " << max_speed << " m/s | Max surface elevation error: " << max_eta_err << " m\n";
    assert(max_speed < 1e-4f && "Lake at rest failed: spurious velocities generated!");
    assert(max_eta_err < 1e-4f && "Lake at rest failed: surface elevation shifted!");
    std::cout << "  PASSED.\n";
}

void test_dam_break_mass_conservation() {
    std::cout << "--- [TEST 2] Dam Break over Dry Bed (Conservation & Non-Negativity) ---\n";
    SimulationConfig cfg;
    cfg.grid.width = 128;
    cfg.grid.height = 32;
    cfg.grid.dx_m = 0.5;
    cfg.grid.dy_m = 0.5;
    cfg.hydro.gravity = 9.81f;
    cfg.hydro.rainfall_rate_ms = 0.0f;

    FloodState state(cfg.grid);
    for (int y = 0; y < cfg.grid.height; ++y) {
        for (int x = 0; x < cfg.grid.width; ++x) {
            size_t idx = state.idx(x, y);
            state.dem[idx] = 0.0f;
            state.h[idx] = (x < 64) ? 2.0f : 0.0f; // dam at x = 32m
            state.u[idx] = 0.0f;
            state.v[idx] = 0.0f;
            state.roughness[idx] = 0.01f;
        }
    }

    ExperimentalSolver solver(cfg, BoundaryCondition::CLOSED);
    solver.initMassBalance(state);
    const double initial_vol = state.totalWaterVolumeM3();

    solver.advanceTo(state, 5.0); // simulate 5s wave propagation

    double final_vol = state.totalWaterVolumeM3();
    double vol_diff = std::abs(final_vol - initial_vol);
    double rel_err = vol_diff / initial_vol;

    bool non_negative = true;
    bool finite_vals = true;
    for (size_t i = 0; i < state.h.size(); ++i) {
        if (state.h[i] < 0.0f) non_negative = false;
        if (!std::isfinite(state.h[i]) || !std::isfinite(state.u[i]) || !std::isfinite(state.v[i])) {
            finite_vals = false;
        }
    }

    std::cout << "  Initial Vol: " << initial_vol << " m^3 | Final Vol: " << final_vol 
              << " m^3 | Error: " << vol_diff << " m^3 (" << (rel_err * 100.0) << "%)\n";
    assert(non_negative && "Negative depth detected in dam break!");
    assert(finite_vals && "Non-finite values detected in dam break!");
    assert(rel_err < 1e-5 && "Mass conservation violated in dam break!");
    std::cout << "  PASSED.\n";
}

void test_rain_wetting_and_cfl_sensitivity() {
    std::cout << "--- [TEST 3] Rain on Complex Topography & Timestep Sensitivity ---\n";
    float cfl_values[] = {0.2f, 0.45f, 0.6f};

    for (float cfl : cfl_values) {
        SimulationConfig cfg;
        cfg.grid.width = 64;
        cfg.grid.height = 64;
        cfg.grid.dx_m = 5.0;
        cfg.grid.dy_m = 5.0;
        cfg.hydro.cfl_number = cfl;
        cfg.hydro.gravity = 9.81f;
        cfg.hydro.rainfall_rate_ms = 50.0f / 3600000.0f; // 50 mm/hr

        FloodState state(cfg.grid);
        // Valley terrain with buildings
        for (int y = 0; y < cfg.grid.height; ++y) {
            for (int x = 0; x < cfg.grid.width; ++x) {
                size_t idx = state.idx(x, y);
                state.dem[idx] = 10.0f + 0.1f * x + 0.05f * y;
                // Add building block
                if (x >= 20 && x <= 25 && y >= 20 && y <= 25) {
                    state.building_mask[idx] = 1.0f;
                }
                state.roughness[idx] = 0.035f;
            }
        }

        ExperimentalSolver solver(cfg, BoundaryCondition::CLOSED);
        solver.initMassBalance(state);
        solver.advanceTo(state, 60.0); // 1 minute rain

        const auto& mb = solver.massBalance();
        std::cout << "  CFL " << cfl << " | Final Vol: " << mb.current_volume_m3 
                  << " m^3 | Expected: " << mb.expected_volume_m3() 
                  << " m^3 | Error: " << mb.volume_error_m3() << " m^3\n";
        assert(std::abs(mb.relative_error()) < 1e-4 && "Rain mass balance violated!");
    }
    std::cout << "  PASSED.\n";
}

void test_open_boundary_no_artificial_inflow() {
    std::cout << "--- [TEST 4] Open Boundary Outflow & Prevention of Inflow ---\n";
    SimulationConfig cfg;
    cfg.grid.width = 64;
    cfg.grid.height = 32;
    cfg.grid.dx_m = 2.0;
    cfg.grid.dy_m = 2.0;
    cfg.hydro.rainfall_rate_ms = 0.0f;

    FloodState state(cfg.grid);
    // Water mound placed near right boundary moving towards it
    for (int y = 0; y < cfg.grid.height; ++y) {
        for (int x = 0; x < cfg.grid.width; ++x) {
            size_t idx = state.idx(x, y);
            state.dem[idx] = 0.0f;
            state.h[idx] = 1.0f;
            state.u[idx] = 1.5f; // flowing rightward towards boundary
            state.v[idx] = 0.0f;
            state.roughness[idx] = 0.01f;
        }
    }

    ExperimentalSolver solver(cfg, BoundaryCondition::OPEN_NO_INFLOW);
    solver.initMassBalance(state);
    solver.advanceTo(state, 10.0);

    const auto& mb = solver.massBalance();
    std::cout << "  V_in: " << mb.boundary_inflow_m3 << " m^3 | V_out: " << mb.boundary_outflow_m3
              << " m^3 | Final: " << mb.current_volume_m3 
              << " m^3 | Conservation Error: " << mb.volume_error_m3() << " m^3\n";
    assert(mb.boundary_inflow_m3 == 0.0 && "Artificial inflow was detected at open boundary!");
    assert(mb.boundary_outflow_m3 > 0.0 && "Expected water outflow across boundary!");
    assert(std::abs(mb.relative_error()) < 1e-4 && "Conservation error with outflow!");
    std::cout << "  PASSED.\n";
}

int main() {
    std::cout << "=== RUNNING SHALLOW WATER SOLVER PHYSICS BENCHMARKS ===\n\n";
    test_lake_at_rest();
    test_dam_break_mass_conservation();
    test_rain_wetting_and_cfl_sensitivity();
    test_open_boundary_no_artificial_inflow();
    std::cout << "\nALL SOLVER PHYSICS BENCHMARKS PASSED SUCCESSFULLY!\n";
    return 0;
}
