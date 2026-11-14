#pragma once
#include <cstdint>

namespace wetharepot {

struct GridSpec {
    int width = 256;
    int height = 256;
    double dx_m = 10.0;
    double dy_m = 10.0;
    double origin_x_m = 0.0;
    double origin_y_m = 0.0;
};

struct HydrologyParams {
    float gravity = 9.81f;
    float cfl_number = 0.45f;
    float dry_threshold_m = 1e-4f;
    float default_manning_n = 0.035f;
    float rainfall_rate_ms = 0.0f;
    float infiltration_rate_ms = 0.0f;
};

struct SimulationConfig {
    GridSpec grid;
    HydrologyParams hydro;
    double fixed_step_s = 1.0 / 60.0;
    double max_dt_s = 1.0;
    bool open_boundaries = true;
};

} // namespace wetharepot