import { CompassRoseIcon, ArrowRightIcon } from "../icons/CartographicIcons";

interface NotFoundPageProps {
  onBackToAtlas: () => void;
}

export function NotFoundPage({ onBackToAtlas }: NotFoundPageProps) {
  return (
    <div className="editorial-page-container not-found-page">
      <div className="not-found-card">
        <div className="not-found-seal" aria-hidden="true">
          <CompassRoseIcon width={48} height={48} />
        </div>
        <div className="not-found-badge">TERRA INCOGNITA • 404</div>
        <h1 className="not-found-title">Uncharted Spatial Coordinates</h1>
        <p className="not-found-lead">
          The requested coordinate or navigational route lies outside the modeled $256 \times 256$
          urban grid boundary for Bengaluru.
        </p>

        <div className="not-found-spec">
          <div><span>GRID STATUS:</span> <code>OUT_OF_BOUNDS</code></div>
          <div><span>CRS REGISTRATION:</span> <code>EPSG:32643 / UTM 43N</code></div>
          <div><span>SURFACE ELEVATION:</span> <code>UNDEFINED</code></div>
        </div>

        <button type="button" onClick={onBackToAtlas} className="btn-editorial-primary">
          Return to Catchment Atlas
          <ArrowRightIcon width={16} height={16} />
        </button>
      </div>
    </div>
  );
}
