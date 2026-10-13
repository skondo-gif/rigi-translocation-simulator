import type { PlaybackClock } from '../hooks/usePlaybackClock';

interface Props {
  clock: PlaybackClock;
  maxTimeS: number;
}

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10, 20];

export default function PlaybackControls({ clock, maxTimeS }: Props) {
  return (
    <div className="playback-controls">
      <button type="button" className="btn" onClick={clock.reset}>
        ⏮ 最初から
      </button>
      {clock.isPlaying ? (
        <button type="button" className="btn btn-primary" onClick={clock.pause}>
          ⏸ 一時停止
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={clock.play}>
          ▶ 再生
        </button>
      )}
      <label className="playback-speed">
        再生速度
        <select
          value={clock.speed}
          onChange={(e) => clock.setSpeed(Number.parseFloat(e.target.value))}
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
      <input
        className="playback-scrubber"
        type="range"
        min={0}
        max={Math.max(1, maxTimeS)}
        step={0.1}
        value={Math.min(clock.time, maxTimeS)}
        onChange={(e) => clock.setTime(Number.parseFloat(e.target.value))}
      />
      <span className="playback-time">
        {clock.time.toFixed(1)} / {maxTimeS.toFixed(0)} s
      </span>
    </div>
  );
}
