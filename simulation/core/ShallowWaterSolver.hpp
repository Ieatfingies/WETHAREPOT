#pragma once
#include "config.hpp"
#include "FloodState.hpp"
#include <vector>

namespace wetharepot {

class ShallowWaterSolver {
public:
    explicit ShallowWaterSolver(const SimulationConfig& cfg);
    double stepAdaptive(FloodState& state, double max_step_s = -1.0);
    void advanceTo(FloodState& state, double target_time_s);
    void setRainfallRate(float rate_ms) { cfg_.hydro.rainfall_rate_ms = rate_ms; }
    const SimulationConfig& config() const { return cfg_; }

private:
    SimulationConfig cfg_;
    std::vector<float> h_next_;
    std::vector<float> hu_next_;
    std::vector<float> hv_next_;
    float computeCflDt(const FloodState& state) const;
};

} // namespace wetharepot