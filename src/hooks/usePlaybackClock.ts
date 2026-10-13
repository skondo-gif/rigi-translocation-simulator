import { useCallback, useEffect, useRef, useState } from 'react';

export interface PlaybackClock {
  time: number;
  isPlaying: boolean;
  speed: number;
  setSpeed: (s: number) => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  setTime: (t: number) => void;
}

/** シミュレーション時間を実時間から駆動する再生クロック */
export function usePlaybackClock(maxTimeS: number): PlaybackClock {
  const [time, setTimeState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) return;
    lastRef.current = null;

    const step = (now: number) => {
      if (lastRef.current !== null) {
        const dtS = (now - lastRef.current) / 1000;
        setTimeState((t) => {
          const next = t + dtS * speed;
          if (next >= maxTimeS) {
            setIsPlaying(false);
            return maxTimeS;
          }
          return next;
        });
      }
      lastRef.current = now;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying, speed, maxTimeS]);

  const play = useCallback(() => {
    setTimeState((t) => (t >= maxTimeS ? 0 : t));
    setIsPlaying(true);
  }, [maxTimeS]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setTimeState(0);
  }, []);

  const setTime = useCallback((t: number) => {
    setTimeState(Math.max(0, t));
  }, []);

  return { time, isPlaying, speed, setSpeed, play, pause, reset, setTime };
}
