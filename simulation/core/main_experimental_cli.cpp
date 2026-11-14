#include "config.hpp"
#include "FloodState.hpp"
#include "ExperimentalSolver.hpp"
#include <iostream>
#include <fstream>
#include <string>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <filesystem>
#include <cmath>

using namespace wetharepot;

namespace fs = std::filesystem;

bool loadBinary(const std::string& path, std::vector<float>& out) {
    std::ifstream in(path, std::ios::binary);
    if (!in.is_open()) {
        std::cerr << "[SWE-Exp] Error opening input file: " << path << "\n";
        return false;
    }
    in.seekg(0, std::ios::end);
    size_t fileSize = in.tellg();
    in.seekg(0, std::ios::beg);

    if (fileSize != out.size() * sizeof(float)) {
        std::cerr << "[SWE-Exp] File size mismatch in " << path 
                  << " (expected " << out.size() * sizeof(float) 
                  << " bytes, got " << fileSize << " bytes)\n";
        return false;
    }

    in.read(reinterpret_cast<char*>(out.data()), out.size() * sizeof(float));
    return static_cast<bool>(in);
}

bool saveBinary(const std::string& path, const std::vector<float>& data) {
    std::ofstream out(path, std::ios::binary);
    if (!out.is_open()) {
        std::cerr << "[SWE-Exp] Error creating output file: " << path << "\n";
        return false;
    }
    out.write(reinterpret_cast<const char*>(data.data()), data.size() * sizeof(float));
    if (out.bad() || out.fail()) {
        std::cerr << "[SWE-Exp] Error writing data to " << path << "\n";
        return false;
    }
    return true;
}

int main(int argc, char** argv) {
    if (argc < 7) {
        std::cerr << "Usage: swe_solver_exp <input_dir> <output_dir> <grid_size> <dx_m> <rain_mmhr> <duration_s> [save_interval_s] [bc_mode: closed|open|controlled]\n";
        return 1;
    }

    const std::string in_dir = argv[1];
    const std::string out_dir = argv[2];
    const int N = std::stoi(argv[3]);
    const double dx = std::stod(argv[4]);
    const float rain_mmhr = std::stof(argv[5]);
    const double duration_s = std::stod(argv[6]);
    const double save_interval_s = (argc >= 8) ? std::stod(argv[7]) : 60.0;
    std::string bc_str = (argc >= 9) ? argv[8] : "closed";

    BoundaryCondition bc = BoundaryCondition::CLOSED;
    if (bc_str == "open") {
        bc = BoundaryCondition::OPEN_NO_INFLOW;
    } else if (bc_str == "controlled") {
        bc = BoundaryCondition::CONTROLLED_OUTFLOW;
    }

    std::error_code ec;
    fs::create_directories(out_dir, ec);
    if (ec) {
        std::cerr << "[SWE-Exp] Failed to create output directory: " << out_dir << " (" << ec.message() << ")\n";
        return 1;
    }

    SimulationConfig cfg;
    cfg.grid.width = N;
    cfg.grid.height = N;
    cfg.grid.dx_m = dx;
    cfg.grid.dy_m = dx;
    cfg.hydro.rainfall_rate_ms = rain_mmhr / 3600000.0f;
    cfg.open_boundaries = (bc != BoundaryCondition::CLOSED);

    FloodState state(cfg.grid);
    if (!loadBinary(in_dir + "/dem.bin", state.dem) ||
        !loadBinary(in_dir + "/mask.bin", state.building_mask) ||
        !loadBinary(in_dir + "/rough.bin", state.roughness)) {
        std::cerr << "[SWE-Exp] Failed to load binary grid files from " << in_dir << "\n";
        return 1;
    }

    ExperimentalSolver solver(cfg, bc);
    solver.initMassBalance(state);

    auto t0 = std::chrono::high_resolution_clock::now();
    int frame = 0;
    for (double t = save_interval_s; t <= duration_s + 1e-5; t += save_interval_s) {
        solver.advanceTo(state, t);
        std::ostringstream oss;
        oss << out_dir << "/frame_" << std::setw(4) << std::setfill('0') << frame++;
        if (!saveBinary(oss.str() + "_h.bin", state.h) ||
            !saveBinary(oss.str() + "_u.bin", state.u) ||
            !saveBinary(oss.str() + "_v.bin", state.v)) {
            std::cerr << "[SWE-Exp] Frame write failed at frame " << (frame - 1) << "\n";
            return 1;
        }
    }
    auto t1 = std::chrono::high_resolution_clock::now();
    double elapsed_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();

    const auto& mb = solver.massBalance();
    std::cout << std::fixed << std::setprecision(4);
    std::cout << "[SWE-Exp] Completed " << duration_s << "s sim (" << state.step_count
              << " 2D-CFL steps) in " << elapsed_ms << " ms\n";
    std::cout << "[SWE-Exp] Mass Balance: V_init=" << mb.initial_volume_m3
              << " m^3, V_rain=" << mb.rain_volume_m3
              << " m^3, V_in=" << mb.boundary_inflow_m3
              << " m^3, V_out=" << mb.boundary_outflow_m3
              << " m^3, V_final=" << mb.current_volume_m3
              << " m^3, Error=" << mb.volume_error_m3()
              << " m^3 (" << (mb.relative_error() * 100.0) << "%)\n";

    // Write diagnostic summary
    std::ofstream diag(out_dir + "/mass_balance.json");
    if (diag.is_open()) {
        diag << "{\n"
             << "  \"duration_s\": " << duration_s << ",\n"
             << "  \"step_count\": " << state.step_count << ",\n"
             << "  \"elapsed_ms\": " << elapsed_ms << ",\n"
             << "  \"v_initial_m3\": " << mb.initial_volume_m3 << ",\n"
             << "  \"v_rain_m3\": " << mb.rain_volume_m3 << ",\n"
             << "  \"v_inflow_m3\": " << mb.boundary_inflow_m3 << ",\n"
             << "  \"v_outflow_m3\": " << mb.boundary_outflow_m3 << ",\n"
             << "  \"v_final_m3\": " << mb.current_volume_m3 << ",\n"
             << "  \"volume_error_m3\": " << mb.volume_error_m3() << ",\n"
             << "  \"relative_error\": " << mb.relative_error() << "\n"
             << "}\n";
    }

    return 0;
}
