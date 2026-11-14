interface TimelineBarProps {
  frameCount: number;
  currentFrame: number;
  intervalMin: number;
  playing: boolean;
  onTogglePlay: () => void;
  onSelectFrame: (index: number) => void;
}

export function TimelineBar({
  frameCount,
  currentFrame,
  intervalMin,
  playing,
  onTogglePlay,
  onSelectFrame,
}: TimelineBarProps) {
  const safeCount = Math.max(1, frameCount);
  const elapsed = currentFrame * intervalMin;

  return (
    <div className="timeline-panel">
      <button
        type="button"
        className="timeline-play"
        onClick={onTogglePlay}
        aria-label={playing ? "Pause animation" : "Play animation"}
      >
        {playing ? "Ⅱ" : "▶"}
      </button>

      <div className="timeline-main">
        <div className="timeline-topline">
          <span className="timeline-label">SIMULATION TIMELINE</span>
          <span className="timeline-time">T + {elapsed} MIN</span>
        </div>
        <input
          className="timeline-range"
          type="range"
          min="0"
          max={safeCount - 1}
          step="1"
          value={Math.min(currentFrame, safeCount - 1)}
          onChange={(event) => onSelectFrame(Number(event.target.value))}
          aria-label="Simulation time frame"
        />
        <div className="timeline-ticks">
          <span>0 min</span>
          <span>{Math.round(((safeCount - 1) * intervalMin) / 2)} min</span>
          <span>{(safeCount - 1) * intervalMin} min</span>
        </div>
      </div>

      <div className="timeline-frame">
        <strong>{currentFrame + 1}</strong>
        <span>/ {frameCount} FRAMES</span>
      </div>
    </div>
  );
}
