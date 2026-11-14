import { useState, useEffect, useRef } from "react";
import {
  PlayIcon,
  PauseIcon,
  StepBackwardIcon,
  StepForwardIcon,
  HistoryIcon,
  CompassRoseIcon,
} from "./icons/CartographicIcons";

interface TimeTravelControllerProps {
  currentHour: number;
  onHourChange: (hour: number | ((prev: number) => number)) => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  isHistorical: boolean;
  onResetToLive: () => void;
}

const SPEED_MULTIPLIERS = [1, 5, 30, 60];

export function TimeTravelController({
  currentHour,
  onHourChange,
  selectedDate,
  onDateChange,
  isHistorical,
  onResetToLive,
}: TimeTravelControllerProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedIndex, setSpeedIndex] = useState<number>(1); // Default 5x
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Animation loop for historical time-lapse playback
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      const deltaSec = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      const speed = SPEED_MULTIPLIERS[speedIndex];
      // 1 real second advances (speed / 60) simulation hours
      const hourDelta = (speed / 60) * deltaSec;

      onHourChange((prevHour: number) => {
        let nextHour = prevHour + hourDelta;
        if (nextHour >= 24) {
          nextHour = nextHour % 24;
        }
        return nextHour;
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, speedIndex, onHourChange]);

  const formatHourToTime = (hour: number) => {
    const totalMinutes = Math.round(hour * 60) % 1440;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  const handleStep = (minutes: number) => {
    setIsPlaying(false);
    onHourChange((prev) => {
      let next = prev + minutes / 60;
      if (next < 0) next += 24;
      if (next >= 24) next -= 24;
      return next;
    });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const [y, m, d] = e.target.value.split("-").map(Number);
    const newDate = new Date(y, m - 1, d);
    onDateChange(newDate);
  };

  const dateInputStr = `${selectedDate.getFullYear()}-${(selectedDate.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${selectedDate.getDate().toString().padStart(2, "0")}`;

  return (
    <div
      className="time-travel-bar"
      role="region"
      aria-label="Solar Day/Night and Historical Time Travel Controller"
    >
      <div className="time-travel-inner">
        {/* Live vs Replay Indicator */}
        <div className="time-mode-indicator">
          {isHistorical ? (
            <div className="badge-historical" title="Paused at historical timestamp">
              <span className="indicator-dot amber-pulse" />
              <span>HISTORICAL REPLAY</span>
            </div>
          ) : (
            <div className="badge-live" title="Synchronized with real Bengaluru time">
              <span className="indicator-dot green-pulse" />
              <span>LIVE SOLAR CLOCK</span>
            </div>
          )}
        </div>

        {/* Date Selector */}
        <div className="time-date-picker">
          <HistoryIcon width={14} height={14} />
          <input
            type="date"
            className="time-date-input"
            value={dateInputStr}
            onChange={handleDateChange}
            aria-label="Historical Date"
            title="Select date for solar & weather re-play"
          />
        </div>

        {/* Playback Controls */}
        <div className="time-playback-actions">
          <button
            type="button"
            className="time-action-btn"
            onClick={() => handleStep(-15)}
            title="Step Back 15 Minutes"
            aria-label="Step Back 15 Minutes"
          >
            <StepBackwardIcon width={13} height={13} />
          </button>

          <button
            type="button"
            className={`time-action-btn primary-action ${isPlaying ? "is-playing" : ""}`}
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? "Pause Day/Night Loop" : "Play Day/Night Solar Progression"}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <PauseIcon width={14} height={14} />
            ) : (
              <PlayIcon width={14} height={14} />
            )}
          </button>

          <button
            type="button"
            className="time-action-btn"
            onClick={() => handleStep(15)}
            title="Step Forward 15 Minutes"
            aria-label="Step Forward 15 Minutes"
          >
            <StepForwardIcon width={13} height={13} />
          </button>

          <button
            type="button"
            className="time-speed-btn"
            onClick={() => setSpeedIndex((prev) => (prev + 1) % SPEED_MULTIPLIERS.length)}
            title="Playback Speed Multiplier"
          >
            {SPEED_MULTIPLIERS[speedIndex]}×
          </button>
        </div>

        {/* Time of Day Slider */}
        <div className="time-slider-container">
          <div className="time-display-readout">
            <CompassRoseIcon width={13} height={13} />
            <span className="time-readout-val">{formatHourToTime(currentHour)} IST</span>
          </div>

          <input
            type="range"
            min={0}
            max={23.99}
            step={0.05}
            value={currentHour}
            onChange={(e) => {
              setIsPlaying(false);
              onHourChange(parseFloat(e.target.value));
            }}
            className="time-range-slider"
            aria-label="Time of Day Slider"
          />
        </div>

        {/* Return to Live Button */}
        {isHistorical && (
          <button
            type="button"
            className="time-return-live-btn"
            onClick={() => {
              setIsPlaying(false);
              onResetToLive();
            }}
            title="Snap back to current real-world Bengaluru local time"
          >
            <span>RETURN TO LIVE</span>
          </button>
        )}
      </div>
    </div>
  );
}
