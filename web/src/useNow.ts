// The current time, refreshed every few seconds, so "uploaded 5 seconds ago"
// keeps counting while the page stays open.

import { useEffect, useState } from 'react';

/** Milliseconds since 1970, updated every `everyMs` (default 10 seconds). */
export function useNow(everyMs: number = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    // React runs this returned function when the panel goes away: stop the timer.
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}
