// Live stream slots from the outlets' own YouTube channels.
// A video loads only after the reader clicks "Play", and only one plays at a time.

import { useEffect, useState } from 'react';
import type { StreamSlot } from '@ph-monitor/shared';
import { fetchStreams, refreshStreams } from '../api.ts';
import { categoryLabel } from '../format.ts';
import { fill, useStrings } from '../i18n/index.ts';
import { useNow } from '../useNow.ts';
import { UploadedTime } from './UploadedTime.tsx';
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
  // Ticks every 10 seconds so "Uploaded … ago" stays right.
  const now = useNow();
  const [slots, setSlots] = useState<StreamSlot[] | null>(null);
  const [failed, setFailed] = useState(false);
  // The id of the one slot that is playing, or null for none.
  const [playingId, setPlayingId] = useState<string | null>(null);
  // True while the Refresh button waits for the server's fresh check.
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // On page load, ask for a fresh check of the channels (the server skips it if
    // one ran in the last few minutes). After that, re-read the list every 5 minutes.
    async function load(fresh: boolean) {
      try {
        const result = fresh ? await refreshStreams() : await fetchStreams();
        if (!cancelled) {
          setSlots(result);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load(true);
    const timer = setInterval(() => void load(false), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Refresh: the server checks the channels again (at most every few minutes), then sends the slots.
  async function refresh() {
    setRefreshing(true);
    try {
      setSlots(await refreshStreams());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }

  // The slot that is playing now, if any. `?? null` turns "not found" into null.
  const playing = slots?.find((slot) => slot.id === playingId) ?? null;

  return (
    <section className="panel panel-streams" aria-labelledby="streams-title">
      <div className="panel-head">
        <h2 id="streams-title">{t.streams.title}</h2>
        <button
          className="filter"
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-busy={refreshing}
          title={t.streams.refreshLabel}
        >
          {refreshing ? t.streams.refreshing : t.streams.refresh}
        </button>
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
                  <div className="muted">{categoryLabel(slot.category)}</div>
                  {slot.publishedAt && <UploadedTime iso={slot.publishedAt} now={now} />}
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
