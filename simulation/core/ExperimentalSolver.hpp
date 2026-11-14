#pragma once
#include "config.hpp"
#include "FloodState.hpp"
#include <vector>
#include <cstdint>

namespace wetharepot {

enum class BoundaryCondition {
    CLOSED = 0,
    OPEN_NO_INFLOW = 1,
    CONTROLLED_OUTFLOW = 2
};

struct MassBalanceReport {
    double initial_volume_m3 = 0.0;
    double rain_volume_m3 = 0.0;
    double boundary_inflow_m3 = 0.0;
    double boundary_outflow_m3 = 0.0;
    double current_volume_m3 = 0.0;

    double expected_volume_m3() const {
        return initial_volume_m3 + rain_volume_m3 + boundary_inflow_m3 - boundary_outflow_m3;
    }

    double volume_error_m3() const {
        return current_volume_m3 - expected_volume_m3();
    }

    double relative_error() const {
        double exp = expected_volume_m3();
        return (exp > 1e-6) ? (volume_error_m3() / exp) : 0.0;
    }
};

class ExperimentalSolver {
public:
    explicit ExperimentalSolver(
        const SimulationConfig& cfg,
        BoundaryCondition bc = BoundaryCondition::CLOSED
    );

    double stepAdaptive(FloodState& state, double max_step_s = -1.0);
    void advanceTo(FloodState& state, double target_time_s);

    void setRainfallRate(float rate_ms) { cfg_.hydro.rainfall_rate_ms = rate_ms; }
    void setRainfallGrid(const std::vector<float>& grid) { rain_grid_ms_ = grid; }
    void clearRainfallGrid() { rain_grid_ms_.clear(); }
    bool hasRainfallGrid() const { return !rain_grid_ms_.empty(); }
    const std::vector<float>& rainfallGrid() const { return rain_grid_ms_; }
    void setBoundaryCondition(BoundaryCondition bc) { boundary_cond_ = bc; }
    BoundaryCondition boundaryCondition() const { return boundary_cond_; }
    const SimulationConfig& config() const { return cfg_; }
    const MassBalanceReport& massBalance() const { return mass_balance_; }

    void initMassBalance(const FloodState& state);

private:
    SimulationConfig cfg_;
    BoundaryCondition boundary_cond_;
    std::vector<float> h_next_;
    std::vector<float> hu_next_;
    std::vector<float> hv_next_;
    std::vector<float> rain_grid_ms_;
    MassBalanceReport mass_balance_;
    bool mass_balance_initialized_ = false;

    float compute2DCflDt(const FloodState& state) const;
};

} // namespace wetharepot
