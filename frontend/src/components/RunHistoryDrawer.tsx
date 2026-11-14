import { useEffect, useState } from "react";
import type { HistoricalRunSummary } from "../types/simulation";
import { fetchRecentRuns } from "../api/client";
import {
  HistoryIcon,
  CloseIcon,
  CompassRoseIcon,
  LayersIcon,
} from "./icons/CartographicIcons";

interface RunHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRun: (runId: string) => void;
  activeRunId?: string;
}

function formatDate(timestampSec: number): string {
  if (!timestampSec) return "—";
  const date = new Date(timestampSec * 1000);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RunHistoryDrawer({
  isOpen,
  onClose,
  onSelectRun,
  activeRunId,
}: RunHistoryDrawerProps) {
  const [runs, setRuns] = useState<HistoricalRunSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;

    queueMicrotask(() => {
      if (!ignore) {
        setLoading(true);
        setError(null);
      }
    });

    fetchRecentRuns()
      .then((data) => {
        if (!ignore) setRuns(data);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load runs");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="history-drawer-overlay" role="dialog" aria-modal="true" aria-label="Simulation Run History">
      <div className="history-drawer-panel">
        <div className="history-drawer-header">
          <div className="history-header-title">
            <HistoryIcon width={18} height={18} />
            <h2>Historical Simulation Records</h2>
          </div>
          <button
            type="button"
            className="history-close-btn"
            onClick={onClose}
            aria-label="Close history drawer"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>

        <div className="history-drawer-desc">
          <span>Persistent run records stored in PostgreSQL / local database. Click &ldquo;Inspect&rdquo; to load full 2D/3D grids.</span>
        </div>

        <div className="history-drawer-list">
          {loading && (
            <div className="history-loading-state">
              <CompassRoseIcon width={24} height={24} className="cta-spinning-icon" />
              <span>Querying database archives…</span>
            </div>
          )}

          {error && (
            <div className="history-error-state">
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && runs.length === 0 && (
            <div className="history-empty-state">
              <LayersIcon width={24} height={24} />
              <h4>No simulation records logged</h4>
              <p>Execute your first flood simulation to record metrics and spatial outputs.</p>
            </div>
          )}

          {!loading &&
            runs.map((run) => {
              const isCurrent = run.run_id === activeRunId;
              const hasAnalytics = !!run.analytics;

              return (
                <div
                  key={run.run_id}
                  className={`history-item-card ${isCurrent ? "is-current" : ""}`}
                >
                  <div className="history-item-top">
                    <div className="history-item-main">
                      <strong className="history-region">{run.region_id.toUpperCase()}</strong>
                      <span className="history-date tabular-num">{formatDate(run.created_at)}</span>
                    </div>
                    <span className={`history-status-tag ${run.status}`}>
                      {run.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="history-item-params">
                    <span>
                      RAIN: <strong className="tabular-num">{run.rain_mmhr} mm/hr</strong>
                    </span>
                    <span className="sep">•</span>
                    <span>
                      DURATION: <strong className="tabular-num">{run.duration_min} min</strong>
                    </span>
                    {run.runtime_ms && (
                      <>
                        <span className="sep">•</span>
                        <span>
                          SOLVER: <strong className="tabular-num">{Math.round(run.runtime_ms)} ms</strong>
                        </span>
                      </>
                    )}
                  </div>

                  {hasAnalytics && run.analytics && (
                    <div className="history-analytics-pill">
                      <div>
                        <span>PEAK DEPTH:</span>{" "}
                        <strong className="tabular-num">{run.analytics.max_depth_m.toFixed(2)} m</strong>
                      </div>
                      <div>
                        <span>FLOOD AREA:</span>{" "}
                        <strong className="tabular-num">{run.analytics.flooded_area_km2.toFixed(2)} km²</strong>
                      </div>
                    </div>
                  )}

                  <div className="history-item-actions">
                    <button
                      type="button"
                      className="history-load-btn"
                      onClick={() => {
                        onSelectRun(run.run_id);
                        onClose();
                      }}
                      disabled={run.status !== "completed"}
                    >
                      {isCurrent ? "Currently Active" : "Inspect Run Output →"}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
