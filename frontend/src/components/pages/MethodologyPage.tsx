import {
  CompassRoseIcon,
  CpuChipIcon,
  BrainNeuralIcon,
  LayersIcon,
  ArrowRightIcon,
} from "../icons/CartographicIcons";

interface MethodologyPageProps {
  onBackToAtlas: () => void;
}

export function MethodologyPage({ onBackToAtlas }: MethodologyPageProps) {
  return (
    <div className="editorial-page-container">
      <header className="editorial-header">
        <div className="editorial-breadcrumbs">
          <button type="button" onClick={onBackToAtlas} className="breadcrumb-link">
            ← Return to Catchment Atlas
          </button>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">Methodology & Physical Specification</span>
        </div>
        <div className="editorial-title-block">
          <div className="editorial-pretitle">TECHNICAL ARCHITECTURE • SPECIFICATION R01–R07</div>
          <h1 className="editorial-title">Urban Flood Hydrodynamics & Neural Surrogate Framework</h1>
          <p className="editorial-lead">
            WETHAREPOT decouples high-fidelity shallow water hydrodynamic PDE modeling from
            real-time neural surrogate inference for the Bengaluru metropolitan region.
          </p>
        </div>
      </header>

      <main className="editorial-content">
        {/* Section 1: Spatial & Grid Specification */}
        <section className="editorial-section">
          <div className="editorial-section-tag">
            <CompassRoseIcon width={16} height={16} />
            <span>01 / SPATIAL SPECIFICATION</span>
          </div>
          <h2>Coordinate Reference System & Grid Discretization</h2>
          <p>
            Urban Bengaluru exhibits steep localized micro-valleys (rajakaluves) terminating in
            cascading lake systems such as Bellandur and Varthur. To model surface runoff without
            conformal distortion, the entire domain is projected onto metric Cartesian coordinates:
          </p>
          <div className="spec-table-wrap">
            <table className="spec-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Value</th>
                  <th>Physical Significance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>CRS</strong></td>
                  <td><code>EPSG:32643</code></td>
                  <td>WGS 84 / UTM Zone 43N (conformal metric projection for Southern India)</td>
                </tr>
                <tr>
                  <td><strong>Resolution (Δx, Δy)</strong></td>
                  <td><code>10.0 m × 10.0 m</code></td>
                  <td>Sufficient to resolve road channels and primary stormwater arteries</td>
                </tr>
                <tr>
                  <td><strong>Patch Dimensions</strong></td>
                  <td><code>256 × 256 cells</code></td>
                  <td>2.56 km × 2.56 km spatial footprint (6.55 km²) per study area</td>
                </tr>
                <tr>
                  <td><strong>Memory Layout</strong></td>
                  <td><code>float32, C-contiguous</code></td>
                  <td>Index <code>[0, 0]</code> corresponds to North-West corner</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 2: 2D Shallow Water Equations */}
        <section className="editorial-section">
          <div className="editorial-section-tag">
            <CpuChipIcon width={16} height={16} />
            <span>02 / NUMERICAL SOLVER</span>
          </div>
          <h2>C++ 2D Shallow Water Equations (FVM Rusanov)</h2>
          <p>
            Ground truth inundation is governed by the non-linear hyperbolic 2D Shallow Water
            Equations (Saint-Venant system), accounting for mass conservation and momentum flux
            under gravity, bed slope, and Manning bottom friction:
          </p>

          <div className="formula-card">
            <div className="formula-row">
              <strong>Mass Conservation:</strong>
              <code>∂h/∂t + ∂(hu)/∂x + ∂(hv)/∂y = R(t) - I(t)</code>
            </div>
            <div className="formula-row">
              <strong>X-Momentum:</strong>
              <code>∂(hu)/∂t + ∂(hu² + ½gh²)/∂x + ∂(huv)/∂y = -gh ∂z/∂x - gn² u√(u²+v²) / h^(1/3)</code>
            </div>
            <div className="formula-row">
              <strong>Y-Momentum:</strong>
              <code>∂(hv)/∂t + ∂(huv)/∂x + ∂(hv² + ½gh²)/∂y = -gh ∂z/∂y - gn² v√(u²+v²) / h^(1/3)</code>
            </div>
          </div>

          <p>
            The C++ solver uses a cell-centered Finite Volume Method (FVM) with Rusanov numerical
            fluxes and well-balanced hydrostatic reconstruction at wet/dry cell interfaces.
            Timestepping is governed adaptively by the Courant–Friedrichs–Lewy criterion:
            CFL ≤ 0.45.
          </p>
        </section>

        {/* Section 3: Input Tensor Channels */}
        <section className="editorial-section">
          <div className="editorial-section-tag">
            <LayersIcon width={16} height={16} />
            <span>03 / DATA CONTRACT</span>
          </div>
          <h2>Standardized 7-Channel Input Tensor</h2>
          <p>
            Every simulation region is compiled into a standardized (7, 256, 256) tensor combining
            topography, structural obstacles, surface roughness, dynamic hydrology, and atmospheric forcing:
          </p>
          <div className="channel-grid">
            <div className="channel-card">
              <span className="channel-badge">CH 0</span>
              <strong>Bare-Earth DEM (z)</strong>
              <p>Copernicus 30m interpolated to 10m metric elevations (meters above sea level).</p>
            </div>
            <div className="channel-card">
              <span className="channel-badge">CH 1</span>
              <strong>Building Mask (M_bldg)</strong>
              <p>OSM building footprints (binary: 1 = impermeable solid obstacle, 0 = open).</p>
            </div>
            <div className="channel-card">
              <span className="channel-badge">CH 2</span>
              <strong>Roughness (n)</strong>
              <p>Manning roughness: 0.015 (paved roads), 0.035 (urban soil), 0.050 (vegetation).</p>
            </div>
            <div className="channel-card">
              <span className="channel-badge">CH 3</span>
              <strong>Water Depth (h_t)</strong>
              <p>Initial ponding depth in meters at macro-step t.</p>
            </div>
            <div className="channel-card">
              <span className="channel-badge">CH 4</span>
              <strong>Velocity X (u_t)</strong>
              <p>Depth-averaged horizontal flow velocity (m/s).</p>
            </div>
            <div className="channel-card">
              <span className="channel-badge">CH 5</span>
              <strong>Velocity Y (v_t)</strong>
              <p>Depth-averaged vertical flow velocity (m/s).</p>
            </div>
            <div className="channel-card">
              <span className="channel-badge">CH 6</span>
              <strong>Rainfall Rate (R_t)</strong>
              <p>Uniform or gridded precipitation rate converted to m/s.</p>
            </div>
          </div>
        </section>

        {/* Section 4: ML Surrogate Status */}
        <section className="editorial-section">
          <div className="editorial-section-tag">
            <BrainNeuralIcon width={16} height={16} />
            <span>04 / RESEARCH ROADMAP</span>
          </div>
          <h2>Physics-Informed Neural Surrogate Status</h2>
          <p>
            The machine learning engine employs a 2D U-Net convolutional encoder-decoder trained to
            predict autoregressive hydrodynamic updates ΔT = 60s ahead.
          </p>
          <div className="research-status-banner">
            <div className="status-indicator">
              <span className="status-dot offline" />
              <strong>OFFLINE FOR BENCHMARKING</strong>
            </div>
            <p>
              Per the project&rsquo;s preliminary evaluation on 120 held-out Koramangala storm samples,
              the prototype U-Net achieved a Mean Absolute Error of 0.129 m. In accordance with
              scientific rigor, the ML engine remains intentionally disabled on the production interface
              until cross-catchment generalization surpasses physical baseline validation.
            </p>
          </div>
        </section>

        <div className="editorial-cta-row">
          <button type="button" onClick={onBackToAtlas} className="btn-editorial-primary">
            Launch Catchment Atlas
            <ArrowRightIcon width={16} height={16} />
          </button>
        </div>
      </main>
    </div>
  );
}
