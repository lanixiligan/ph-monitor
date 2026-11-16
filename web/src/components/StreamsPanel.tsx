// Live stream slots from the outlets' own YouTube channels.
// A video loads only after the reader clicks "Play", and only one plays at a time.

import { useEffect, useState } from 'react';
import type { StreamSlot } from '@ph-monitor/shared';
import { fetchStreams } from '../api.ts';
import { categoryLabel, formatTime } from '../format.ts';
import { fill, useStrings } from '../i18n/index.ts';
import type { Strings } from '../i18n/index.ts';

const REFRESH_MS = 5 * 60 * 1000;

/** The text label for a slot. isLive can be true, false or null (unknown). */
function liveLabel(isLive: boolean | null, t: Strings): string {
  if (isLive === true) return t.streams.live;
  if (isLive === false) return t.streams.latest;
  return t.streams.latestMaybeOffline;
}

export function StreamsPanel() {
  const { t } = useStrings();
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
      <h2 id="streams-title">{t.streams.title}</h2>
      <p className="muted">{t.streams.note}</p>
      {failed && <p className="muted">{t.streams.failed}</p>}
      {slots !== null && slots.length === 0 && !failed && (
        <p className="muted">{t.streams.none}</p>
      )}
      {slots !== null && slots.length > 0 && (
        <ul className="plain-list">
          {slots.map((slot) => (
            <li key={slot.id}>
              <strong>{slot.outlet}</strong> · {categoryLabel(slot.category)} ·{' '}
              <strong>{liveLabel(slot.isLive, t)}</strong>
              {slot.title && <div>{slot.title}</div>}
              {slot.publishedAt && <div className="muted">{fill(t.streams.uploaded, { time: formatTime(slot.publishedAt) })}</div>}
              {playingId === slot.id ? (
                <>
                  {/* Only the privacy-friendly YouTube host is ever used. */}
                  <iframe
                    className="stream-frame"
                    src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(slot.videoId)}`}
                    title={fill(t.streams.videoTitle, { outlet: slot.outlet })}
                    allow="encrypted-media; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                  <button className="filter" onClick={() => setPlayingId(null)}>
                    {t.streams.stop}
                  </button>
                </>
              ) : (
                <button className="filter" onClick={() => setPlayingId(slot.id)}>
                  {t.streams.play}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
