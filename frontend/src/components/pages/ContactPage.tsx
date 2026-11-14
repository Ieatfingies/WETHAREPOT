import { useState } from "react";
import {
  EnvelopeContactIcon,
  CheckIcon,
  CompassRoseIcon,
} from "../icons/CartographicIcons";

interface ContactPageProps {
  onBackToAtlas: () => void;
}

export function ContactPage({ onBackToAtlas }: ContactPageProps) {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    institution: "",
    subject: "Academic Inquiry",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) return;
    // Client-side confirmation state for research inquiry
    setSubmitted(true);
  };

  return (
    <div className="editorial-page-container">
      <header className="editorial-header">
        <div className="editorial-breadcrumbs">
          <button type="button" onClick={onBackToAtlas} className="breadcrumb-link">
            ← Return to Catchment Atlas
          </button>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">Research Contact & Collaboration</span>
        </div>
        <div className="editorial-title-block">
          <div className="editorial-pretitle">ACADEMIC & CIVIC ENGAGEMENT</div>
          <h1 className="editorial-title">Contact & Research Collaboration</h1>
          <p className="editorial-lead">
            Inquiries regarding hydrodynamic solver benchmarks, GIS terrain datasets, or municipal
            urban flood resilience modeling.
          </p>
        </div>
      </header>

      <main className="editorial-content">
        <div className="contact-grid">
          {/* Verified Institutional Details */}
          <div className="contact-info-panel">
            <h2>Project Directory</h2>
            <div className="info-entry">
              <span className="info-label">PROJECT INITIATIVE</span>
              <strong>WETHAREPOT — Build Beyond &rsquo;26</strong>
              <p>Problem Statement 1.2: Physics-Informed Neural Surrogate for Real-Time Urban Flood Forecasting</p>
            </div>

            <div className="info-entry">
              <span className="info-label">TARGET GEOGRAPHY</span>
              <strong>Bengaluru Metropolitan Area</strong>
              <p>UTM Zone 43N (EPSG:32643) covering 12 major stormwater catchments</p>
            </div>

            <div className="info-entry configurable-entry">
              <span className="info-label">OFFICIAL INQUIRY EMAIL</span>
              <code className="configurable-value">[CONFIGURABLE: Enter institutional research contact email — e.g. hydro@wetharepot.internal]</code>
            </div>

            <div className="info-entry configurable-entry">
              <span className="info-label">CAMPUS / LAB AFFILIATION</span>
              <code className="configurable-value">[CONFIGURABLE: Department of Civil Engineering & Urban Computing Lab, Bengaluru]</code>
            </div>

            <div className="cartographic-note-box">
              <CompassRoseIcon width={18} height={18} />
              <p>
                Urban planning agencies, municipal engineers, and academic researchers seeking
                raw C++ SWE benchmarks or Copernicus DEM datasets can transmit inquiries below.
              </p>
            </div>
          </div>

          {/* Interactive Inquiry Form */}
          <div className="contact-form-panel">
            {submitted ? (
              <div className="contact-success-state" role="status">
                <div className="success-icon-badge" aria-hidden="true">
                  <CheckIcon width={24} height={24} />
                </div>
                <h3>Inquiry Registered</h3>
                <p>
                  Thank you, <strong>{formData.name}</strong>. Your correspondence regarding &ldquo;{formData.subject}&rdquo;
                  has been queued in the local research dispatch.
                </p>
                <div className="receipt-box">
                  <div><span>Contact:</span> <code>{formData.email}</code></div>
                  <div><span>Affiliation:</span> <code>{formData.institution || "Independent"}</code></div>
                </div>
                <button
                  type="button"
                  className="btn-editorial-secondary"
                  onClick={() => {
                    setSubmitted(false);
                    setFormData({ name: "", email: "", institution: "", subject: "Academic Inquiry", message: "" });
                  }}
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="editorial-form">
                <h2>Direct Dispatch</h2>
                <div className="form-group">
                  <label htmlFor="contact-name">Full Name *</label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Dr. A. V. Rao"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="contact-email">Institutional Email *</label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="researcher@university.edu"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="contact-institution">Organization / Agency</label>
                  <input
                    id="contact-institution"
                    type="text"
                    value={formData.institution}
                    onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                    placeholder="e.g. IISc, BBMP, or Research Lab"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="contact-subject">Topic of Inquiry</label>
                  <select
                    id="contact-subject"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  >
                    <option value="Academic Inquiry">Academic & Model Collaboration</option>
                    <option value="Dataset Request">GIS & Hydrodynamic Data Request</option>
                    <option value="Solver Verification">C++ Shallow Water Solver Verification</option>
                    <option value="Municipal Application">Municipal Urban Drainage Application</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="contact-message">Inquiry Details *</label>
                  <textarea
                    id="contact-message"
                    required
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Describe your research context, catchment of interest, or solver questions…"
                  />
                </div>

                <button type="submit" className="btn-editorial-primary">
                  Transmit Inquiry
                  <EnvelopeContactIcon width={16} height={16} />
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
