// The rain forecast for the Typhoon view: loads GET /api/rainforecast while it
// is wanted (and again every 10 minutes), and plays its frames one after the
// other when the reader presses Play. Display only: never part of the score.
// `useRainForecast` is a React "hook": a function that keeps state for a component (App).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RainForecastMap } from '@ph-monitor/shared';
import { fetchRainForecast } from './api.ts';
import type { RainOnMap } from './rainOverlay.ts';

const REFRESH_MS = 10 * 60 * 1000;

/** How long each frame shows while playing. */
const FRAME_MS = 700;

export function useRainForecast(wanted: boolean) {
  // `useState<RainForecastMap | null>` = the forecast, or null while not loaded yet.
  const [data, setData] = useState<RainForecastMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  // The period on screen, so a reload keeps showing the same one when it is still there.
  const shownRef = useRef<string | null>(null);

  // While wanted: load now, then every 10 minutes. Unwanted: stop playing.
  useEffect(() => {
    if (!wanted) {
      setPlaying(false);
      return;
    }
    // Set to false by the cleanup, so an answer that arrives after leaving the view is dropped.
    let stillWanted = true;
    async function load() {
      try {
        const answer = await fetchRainForecast();
        if (!stillWanted) return;
        const same = answer.frames.findIndex((frame) => frame.endsAt === shownRef.current);
        setData(answer);
        setIndex(same >= 0 ? same : 0);
        setFailed(false);
      } catch {
        // Keep what is shown; the panel says the forecast could not be loaded.
        if (stillWanted) setFailed(true);
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      stillWanted = false;
      clearInterval(timer);
    };
  }, [wanted]);

  // While playing: the next frame every 0.7 seconds, back to the first after the last.
  const count = data?.frames.length ?? 0;
  useEffect(() => {
    if (!playing || count === 0) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), FRAME_MS);
    return () => clearInterval(timer);
  }, [playing, count]);

  // One object per frame, made once per answer, so the map can keep each frame's picture.
  const frames = useMemo<RainOnMap[]>(
    () => (data === null ? [] : data.frames.map((frame) => ({ grid: data.grid, mm: frame.mm }))),
    [data],
  );
  const shown = Math.min(index, Math.max(0, frames.length - 1));
  shownRef.current = data?.frames[shown]?.endsAt ?? null;

  return {
    data,
    failed,
    index: shown,
    setIndex,
    playing,
    setPlaying,
    /** The frame for the map; null while wanted is false or nothing is loaded. */
    frame: wanted ? (frames[shown] ?? null) : null,
  };
}
