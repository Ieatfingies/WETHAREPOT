import { ShieldLegalIcon } from "../icons/CartographicIcons";

interface TermsPageProps {
  onBackToAtlas: () => void;
}

export function TermsPage({ onBackToAtlas }: TermsPageProps) {
  return (
    <div className="editorial-page-container">
      <header className="editorial-header">
        <div className="editorial-breadcrumbs">
          <button type="button" onClick={onBackToAtlas} className="breadcrumb-link">
            ← Return to Catchment Atlas
          </button>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">Terms of Scientific Usage</span>
        </div>
        <div className="editorial-title-block">
          <div className="editorial-pretitle">TERMS & SCIENTIFIC DISCLAIMER</div>
          <h1 className="editorial-title">Terms of Scientific Usage</h1>
          <p className="editorial-lead">
            Operational boundaries, academic guidelines, and liability limitations for the
            WETHAREPOT urban flood simulation platform.
          </p>
        </div>
      </header>

      <main className="editorial-content editorial-legal">
        <div className="legal-notice-box alert-box">
          <ShieldLegalIcon width={20} height={20} />
          <div>
            <strong>Scientific & Research Usage Notice</strong>
            <p>
              WETHAREPOT generates mathematical and physical approximations of surface water inundation.
              Model outputs do NOT constitute official municipal warnings, legal zoning certifications,
              or life-safety evacuation orders.
            </p>
          </div>
        </div>

        <section className="legal-section">
          <h2>1. Scientific Purpose & Research Scope</h2>
          <p>
            WETHAREPOT is provided as an advanced urban cartography and environmental research instrument
            developed under the <em>Build Beyond &rsquo;26</em> initiative (Problem Statement 1.2).
            The platform is designed to assist municipal hydrologists, urban planners, civil engineers,
            and academic researchers in studying storm runoff dynamics across Bengaluru catchments.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Simulation Accuracy & Physical Limitations</h2>
          <p>
            While the underlying physics solver solves the 2D Shallow Water Equations using Rusanov
            numerical fluxes on a 10m grid, simulation results are subject to inherent physical constraints:
          </p>
          <ul>
            <li><strong>Sub-surface Drainage:</strong> Underground stormwater pipe networks, culvert clogs, and local drain inlets may not be fully resolved in bare-earth DEM representations.</li>
            <li><strong>Rainfall Uniformity:</strong> Default scenarios apply uniform precipitation across the 2.56 km × 2.56 km tile unless specified by dynamic gridded radar feeds.</li>
            <li><strong>Topographic Granularity:</strong> Micro-topography under 10m spatial resolution is interpolated.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Intellectual Property & Citation</h2>
          <p>
            Users presenting or publishing flood analyses derived from WETHAREPOT agree to cite the
            methodology and platform:
          </p>
          <div className="citation-block">
            <code>WETHAREPOT (2026). Physics-Informed Neural Surrogate for Real-Time Urban Flood Forecasting: Bengaluru Catchment Suite. Build Beyond &rsquo;26.</code>
          </div>
        </section>

        <section className="legal-section">
          <h2>4. Configurable Terms & Governing Law</h2>
          <div className="configurable-block">
            <strong>Operating Organization:</strong> <code>[CONFIGURABLE: Organization Name]</code><br />
            <strong>Governing Jurisdiction:</strong> <code>[CONFIGURABLE: Bengaluru Urban District, Karnataka, India]</code><br />
            <strong>Dispute Resolution Forum:</strong> <code>[CONFIGURABLE: Competent courts of Bengaluru]</code>
          </div>
        </section>

        <section className="legal-section">
          <h2>5. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted under applicable law, the contributors, developers, and
            affiliated academic institutions shall not be liable for any direct, indirect, incidental,
            or consequential damages arising from the use or interpretation of data presented by this
            instrument.
          </p>
        </section>
      </main>
    </div>
  );
}
