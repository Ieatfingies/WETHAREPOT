#pragma once
#include "Config.hpp"
#include <vector>
#include <cstddef>

namespace wetharepot {

struct FloodState {
    GridSpec spec;
    double sim_time_s = 0.0;
    uint64_t step_count = 0;

    std::vector<float> dem;
    std::vector<float> building_mask;
    std::vector<float> roughness;

    std::vector<float> h;
    std::vector<float> u;
    std::vector<float> v;

    explicit FloodState(const GridSpec& grid_spec)
        : spec(grid_spec),
          dem(static_cast<size_t>(grid_spec.width) * grid_spec.height, 0.0f),
          building_mask(static_cast<size_t>(grid_spec.width) * grid_spec.height, 0.0f),
          roughness(static_cast<size_t>(grid_spec.width) * grid_spec.height, 0.035f),
          h(static_cast<size_t>(grid_spec.width) * grid_spec.height, 0.0f),
          u(static_cast<size_t>(grid_spec.width) * grid_spec.height, 0.0f),
          v(static_cast<size_t>(grid_spec.width) * grid_spec.height, 0.0f) {}

    inline size_t idx(int x, int y) const {
        return static_cast<size_t>(y) * static_cast<size_t>(spec.width) + static_cast<size_t>(x);
    }

    double totalWaterVolumeM3() const {
        double vol = 0.0;
        const double cell_area = spec.dx_m * spec.dy_m;
        for (size_t i = 0; i < h.size(); ++i) {
            if (building_mask[i] < 0.5f) {
                vol += static_cast<double>(h[i]) * cell_area;
            }
        }
        return vol;
    }
};

} // namespace wetharepot