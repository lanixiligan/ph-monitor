// Live stream slots from the outlets' own YouTube channels.
// A video loads only after the reader clicks "Play", and only one plays at a time.

import { useEffect, useState } from 'react';
import type { StreamSlot } from '@ph-monitor/shared';
import { fetchStreams } from '../api.ts';
import { categoryLabel, formatTime } from '../format.ts';
import { fill, useStrings } from '../i18n/index.ts';
import type { Strings } from '../i18n/index.ts';
import { WarnIcon } from './WarnIcon.tsx';

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

  // The slot that is playing now, if any. `?? null` turns "not found" into null.
  const playing = slots?.find((slot) => slot.id === playingId) ?? null;

  return (
    <section className="panel panel-streams" aria-labelledby="streams-title">
      <div className="panel-head">
        <h2 id="streams-title">{t.streams.title}</h2>
      </div>

      {/* The player sits above the list and stays put while the list scrolls. */}
      {playing && (
        <div className="player">
          {/* Only the privacy-friendly YouTube host is ever used. */}
          <iframe
            className="stream-frame"
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(playing.videoId)}`}
            title={fill(t.streams.videoTitle, { outlet: playing.outlet })}
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}

      <div className="panel-body">
        <p className="muted">{t.streams.note}</p>
        {failed && (
          <p className="notice">
            <WarnIcon /> {t.streams.failed}
          </p>
        )}
        {slots !== null && slots.length === 0 && !failed && (
          <p className="muted">{t.streams.none}</p>
        )}
        {slots !== null && slots.length > 0 && (
          <ul className="plain-list">
            {slots.map((slot) => (
              <li key={slot.id} className="stream">
                <div className="stream-text">
                  <strong>{slot.outlet}</strong>{' '}
                  <span className={slot.isLive === true ? 'tag tag-live' : 'tag'}>
                    {liveLabel(slot.isLive, t)}
                  </span>
                  {slot.title && <div className="stream-title">{slot.title}</div>}
                  <div className="muted">
                    {categoryLabel(slot.category)}
                    {slot.publishedAt &&
                      `, ${fill(t.streams.uploaded, { time: formatTime(slot.publishedAt) })}`}
                  </div>
                </div>
                {playingId === slot.id ? (
                  <button className="filter" aria-pressed="true" onClick={() => setPlayingId(null)}>
                    {t.streams.stop}
                  </button>
                ) : (
                  <button className="filter" onClick={() => setPlayingId(slot.id)}>
                    {t.streams.play}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
