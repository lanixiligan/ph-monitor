// Live stream slots from the outlets' own YouTube channels.
// A video loads only after the reader clicks "Play", and only one plays at a time.

import { useEffect, useState } from 'react';
import type { StreamSlot } from '@ph-monitor/shared';
import { fetchStreams } from '../api.ts';
import { categoryLabel, formatTime } from '../format.ts';

const REFRESH_MS = 5 * 60 * 1000;

/** The text label for a slot. isLive can be true, false or null (unknown). */
function liveLabel(isLive: boolean | null): string {
  if (isLive === true) return 'LIVE';
  if (isLive === false) return 'Latest';
  return 'Latest (may be offline)';
}

export function StreamsPanel() {
  const [slots, setSlots] = useState<StreamSlot[] | null>(null);
  const [failed, setFailed] = useState(false);
  // The id of the one slot that is playing, or null for none.
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await fetchStreams();
        if (!cancelled) {
          setSlots(result);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="panel" aria-labelledby="streams-title">
      <h2 id="streams-title">Live streams</h2>
      <p className="muted">
        Video: YouTube, from each outlet&apos;s own channel. A stream is not an official warning.
      </p>
      {failed && <p className="muted">Could not load the streams right now.</p>}
      {slots !== null && slots.length === 0 && !failed && (
        <p className="muted">No streams are available right now.</p>
      )}
      {slots !== null && slots.length > 0 && (
        <ul className="plain-list">
          {slots.map((slot) => (
            <li key={slot.id}>
              <strong>{slot.outlet}</strong> · {categoryLabel(slot.category)} ·{' '}
              <strong>{liveLabel(slot.isLive)}</strong>
              {slot.title && <div>{slot.title}</div>}
              {slot.publishedAt && <div className="muted">Uploaded {formatTime(slot.publishedAt)}</div>}
              {playingId === slot.id ? (
                <>
                  {/* Only the privacy-friendly YouTube host is ever used. */}
                  <iframe
                    className="stream-frame"
                    src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(slot.videoId)}`}
                    title={`${slot.outlet} video`}
                    allow="encrypted-media; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                  <button className="filter" onClick={() => setPlayingId(null)}>
                    Stop
                  </button>
                </>
              ) : (
                <button className="filter" onClick={() => setPlayingId(slot.id)}>
                  Play
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
