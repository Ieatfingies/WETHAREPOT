import { ShieldLegalIcon } from "../icons/CartographicIcons";

interface PrivacyPolicyPageProps {
  onBackToAtlas: () => void;
}

export function PrivacyPolicyPage({ onBackToAtlas }: PrivacyPolicyPageProps) {
  return (
    <div className="editorial-page-container">
      <header className="editorial-header">
        <div className="editorial-breadcrumbs">
          <button type="button" onClick={onBackToAtlas} className="breadcrumb-link">
            ← Return to Catchment Atlas
          </button>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">Privacy & Data Governance</span>
        </div>
        <div className="editorial-title-block">
          <div className="editorial-pretitle">DATA GOVERNANCE & PRIVACY DISCLOSURE</div>
          <h1 className="editorial-title">Privacy Policy</h1>
          <p className="editorial-lead">
            Information regarding functional data handling, client-side preferences, and server execution
            for the WETHAREPOT urban hydrologic modeling instrument.
          </p>
        </div>
      </header>

      <main className="editorial-content editorial-legal">
        <div className="legal-notice-box">
          <ShieldLegalIcon width={20} height={20} />
          <div>
            <strong>Configurable Legal Disclosure</strong>
            <p>
              This document outlines the operational data practices of WETHAREPOT. Sections containing
              institutional identifiers or jurisdiction-specific statutory clauses are marked with
              <code>[CONFIGURABLE: ...]</code> placeholders for production legal onboarding.
            </p>
          </div>
        </div>

        <section className="legal-section">
          <h2>1. Entity Identification & Controller</h2>
          <p>
            The WETHAREPOT research instrument is administered by:
          </p>
          <div className="configurable-block">
            <strong>Operating Entity:</strong> <code>[CONFIGURABLE: Enter Official Institutional / University Entity Name]</code><br />
            <strong>Research Directorate:</strong> <code>[CONFIGURABLE: Urban Hydrology & Climate AI Research Group]</code><br />
            <strong>Data Protection Contact:</strong> <code>[CONFIGURABLE: privacy-inquiries@wetharepot.internal]</code><br />
            <strong>Jurisdiction:</strong> <code>[CONFIGURABLE: Karnataka, India]</code>
          </div>
        </section>

        <section className="legal-section">
          <h2>2. Zero Third-Party Tracking Disclosure</h2>
          <p>
            WETHAREPOT strictly refrains from deploying third-party marketing cookies, cross-site trackers,
            or behavioral advertising scripts. No telemetry is shared with commercial advertising brokers.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Client-Side Functional Storage</h2>
          <p>
            The application may utilize browser <code>localStorage</code> solely for functional, non-tracking
            purposes:
          </p>
          <ul>
            <li>Retaining your last-selected catchment study basin for continuity.</li>
            <li>Preserving user interface display preferences (e.g., metric units).</li>
          </ul>
          <p>
            You may clear this state at any time via your browser settings without impacting core simulation
            capabilities.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Simulation Input & Computational Processing</h2>
          <p>
            When a user requests a flood simulation, the specified catchment identifier, rainfall rate
            (mm/hr), and duration (min) are transmitted to the backend FastAPI service. These inputs
            are processed strictly in-memory or in ephemeral temp directories (RAII workspace) to execute the
            C++ shallow water solver. No user personal data is associated with or persisted in the simulation
            output archives.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Geospatial & Open-Source Data Attribution</h2>
          <p>
            Geographic elevation rasters are derived from the Copernicus 30m Global DEM dataset. Building
            and road network footprints are sourced from OpenStreetMap contributors under the Open Database
            License (ODbL).
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Updates & Inquiries</h2>
          <p>
            Questions regarding this policy or technical research records may be directed to the
            research coordination team at <code>[CONFIGURABLE: privacy@wetharepot.internal]</code>.
          </p>
        </section>
      </main>
    </div>
  );
}
