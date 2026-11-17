#include "config.hpp"
#include "FloodState.hpp"
#include "ShallowWaterSolver.hpp"
#include <iostream>
#include <fstream>
#include <string>
#include <chrono>
#include <iomanip>
#include <sstream>

using namespace wetharepot;

bool loadBinary(const std::string& path, std::vector<float>& out) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return false;
    in.read(reinterpret_cast<char*>(out.data()), out.size() * sizeof(float));
    return static_cast<bool>(in);
}

void saveBinary(const std::string& path, const std::vector<float>& data) {
    std::ofstream out(path, std::ios::binary);
    out.write(reinterpret_cast<const char*>(data.data()), data.size() * sizeof(float));
}

int main(int argc, char** argv) {
    if (argc < 7) {
        std::cerr << "Usage: swe_solver <input_dir> <output_dir> <grid_size> <dx_m> <rain_mmhr> <duration_s> [save_interval_s]\n";
        return 1;
    }

    const std::string in_dir = argv[1];
    const std::string out_dir = argv[2];
    const int N = std::stoi(argv[3]);
    const double dx = std::stod(argv[4]);
    const float rain_mmhr = std::stof(argv[5]);
    const double duration_s = std::stod(argv[6]);
    const double save_interval_s = (argc >= 8) ? std::stod(argv[7]) : 60.0;

    SimulationConfig cfg;
    cfg.grid.width = N;
    cfg.grid.height = N;
    cfg.grid.dx_m = dx;
    cfg.grid.dy_m = dx;
    cfg.hydro.rainfall_rate_ms = rain_mmhr / 3600000.0f;

    FloodState state(cfg.grid);
    if (!loadBinary(in_dir + "/dem.bin", state.dem) ||
        !loadBinary(in_dir + "/mask.bin", state.building_mask) ||
        !loadBinary(in_dir + "/rough.bin", state.roughness)) {
        std::cerr << "[SWE] Failed to load binary grid files from " << in_dir << "\n";
        return 1;
    }

    ShallowWaterSolver solver(cfg);

    auto t0 = std::chrono::high_resolution_clock::now();
    int frame = 0;
    for (double t = save_interval_s; t <= duration_s + 1e-5; t += save_interval_s) {
        solver.advanceTo(state, t);
        std::ostringstream oss;
        oss << out_dir << "/frame_" << std::setw(4) << std::setfill('0') << frame++;
        saveBinary(oss.str() + "_h.bin", state.h);
        saveBinary(oss.str() + "_u.bin", state.u);
        saveBinary(oss.str() + "_v.bin", state.v);
    }
    auto t1 = std::chrono::high_resolution_clock::now();
    double elapsed_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();

    std::cout << "[SWE] Completed " << duration_s << "s sim (" << state.step_count
              << " CFL steps) in " << elapsed_ms << " ms | Final water vol: "
              << state.totalWaterVolumeM3() << " m^3\n";
    return 0;
}
