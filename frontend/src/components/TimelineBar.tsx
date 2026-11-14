import {
  PlayIcon,
  PauseIcon,
  StepBackIcon,
  StepForwardIcon,
  ChronoIcon,
} from "./icons/CartographicIcons";

interface TimelineBarProps {
  frameCount: number;
  currentFrame: number;
  durationMin: number;
  playing: boolean;
  onTogglePlay: () => void;
  onSelectFrame: (index: number) => void;
  onStepFrame?: (delta: number) => void;
}

function formatElapsed(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (s === 0) return `${m} min`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function TimelineBar({
  frameCount,
  currentFrame,
  durationMin,
  playing,
  onTogglePlay,
  onSelectFrame,
}: TimelineBarProps) {
  const safeCount = Math.max(0, frameCount);
  const safeFrame = Math.min(
    Math.max(0, currentFrame),
    Math.max(0, safeCount - 1)
  );

  // Accurate time calculation based on returned frame count & duration
  const frameElapsedMin =
    safeCount > 0 ? ((safeFrame + 1) / safeCount) * durationMin : 0;

  const handleStepBack = () => {
    if (safeFrame > 0) {
      onSelectFrame(safeFrame - 1);
    }
  };

  const handleStepForward = () => {
    if (safeFrame < safeCount - 1) {
      onSelectFrame(safeFrame + 1);
    }
  };

  return (
    <div
      className="editorial-timeline-panel"
      role="region"
      aria-label="Simulation Playback Timeline"
    >
      {/* Playback Button Group */}
      <div className="playback-controls-group">
        <button
          type="button"
          className="timeline-step-btn"
          onClick={handleStepBack}
          disabled={safeCount <= 1 || safeFrame === 0}
          title="Step to previous frame"
          aria-label="Step to previous frame"
        >
          <StepBackIcon width={14} height={14} />
        </button>

        <button
          type="button"
          className={`timeline-play-toggle ${playing ? "is-active" : ""}`}
          onClick={onTogglePlay}
          disabled={safeCount <= 1}
          title={playing ? "Pause hydrodynamics playback" : "Play hydrodynamics playback"}
          aria-label={playing ? "Pause animation" : "Play animation"}
        >
          {playing ? (
            <PauseIcon width={16} height={16} />
          ) : (
            <PlayIcon width={16} height={16} className="play-triangle" />
          )}
        </button>

        <button
          type="button"
          className="timeline-step-btn"
          onClick={handleStepForward}
          disabled={safeCount <= 1 || safeFrame >= safeCount - 1}
          title="Step to next frame"
          aria-label="Step to next frame"
        >
          <StepForwardIcon width={14} height={14} />
        </button>
      </div>

      {/* Main Timeline Scrubber Area */}
      <div className="timeline-center-track">
        <div className="timeline-meta-row">
          <div className="timeline-title-wrap">
            <ChronoIcon width={14} height={14} className="timeline-icon" />
            <span className="timeline-title">SURFACE RUNOFF HORIZON</span>
          </div>
          <div className="timeline-timestamp">
            <span className="timestamp-prefix">TIME:</span>
            <strong className="timestamp-value tabular-num">
              T + {formatElapsed(frameElapsedMin)}
            </strong>
            <span className="timestamp-total tabular-num">
              / {durationMin} min
            </span>
          </div>
        </div>

        {/* Range Scrubber (No tween lag while dragging) */}
        <div className="timeline-slider-container">
          <input
            className="editorial-timeline-slider"
            type="range"
            min="0"
            max={Math.max(0, safeCount - 1)}
            step="1"
            value={safeFrame}
            disabled={safeCount <= 1}
            onChange={(e) => onSelectFrame(Number(e.target.value))}
            aria-label="Simulation time frame scrubber"
            aria-valuemin={1}
            aria-valuemax={safeCount}
            aria-valuenow={safeFrame + 1}
            aria-valuetext={`Frame ${safeFrame + 1} of ${safeCount}, elapsed time ${formatElapsed(frameElapsedMin)}`}
          />

          {/* Actual frame ticks mark discrete simulation intervals */}
          <div className="timeline-tick-bar" aria-hidden="true">
            {Array.from({ length: safeCount }).map((_, idx) => {
              const tickElapsed = ((idx + 1) / safeCount) * durationMin;
              return (
                <div
                  key={idx}
                  className={`timeline-tick ${idx <= safeFrame ? "is-passed" : ""} ${
                    idx === safeFrame ? "is-current" : ""
                  }`}
                  style={{
                    left: `${safeCount > 1 ? (idx / (safeCount - 1)) * 100 : 50}%`,
                  }}
                  title={`Frame ${idx + 1} (T + ${formatElapsed(tickElapsed)})`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Frame Counter Plaque */}
      <div className="timeline-frame-counter">
        <span className="counter-label">SOLVER FRAME</span>
        <div className="counter-display">
          <strong className="counter-current tabular-num">
            {safeCount > 0 ? (safeFrame + 1).toString().padStart(2, "0") : "00"}
          </strong>
          <span className="counter-sep">/</span>
          <span className="counter-total tabular-num">
            {safeCount.toString().padStart(2, "0")}
          </span>
        </div>
      </div>
    </div>
  );
}
