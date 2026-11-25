// Live Philippine radio: the News & Emergency group first, then a search over
// every other station. A stream loads only after the reader clicks Play, and plays
// straight from the station's own server (never through ours). Only one sound
// plays on the page at a time: App.tsx keeps that one choice for this panel and
// the live news panel. It is one of the right column's tabs (FeedTabs.tsx); a
// station keeps playing while another tab shows.

import { useEffect, useState } from 'react';
import type { RadioStation } from '@ph-monitor/shared';
import { fetchRadio } from '../api.ts';
import { fill, useStrings } from '../i18n/index.ts';
import type { Strings } from '../i18n/index.ts';
import { matchStations } from '../radioSearch.ts';
import { WarnIcon } from './WarnIcon.tsx';

// The list changes once a day and the stream check every 6 hours.
const RELOAD_MS = 30 * 60 * 1000;

type Props = {
  /** The station playing now (its id), or null. */
  playingId: string | null;
  /** Starts a station (its id) or stops it (null). */
  onPlay: (id: string | null) => void;
};

/** "Cebu · MP3 · 64 kbps": the parts that are known. */
function details(station: RadioStation, t: Strings): string {
  const kbps = station.bitrate === null ? null : fill(t.radio.kbps, { n: station.bitrate });
  return [station.place, station.codec, kbps].filter((part) => part !== null).join(' · ');
}

type RowProps = { station: RadioStation; isPlaying: boolean; onPlay: (id: string | null) => void; t: Strings };

function StationRow({ station, isPlaying, onPlay, t }: RowProps) {
  const meta = details(station, t);
  return (
    <li className="stream">
      <div className="stream-text">
        <strong>{station.name}</strong>
        {meta && <div className="muted">{meta}</div>}
      </div>
      {isPlaying ? (
        <button className="filter" aria-pressed="true" aria-label={fill(t.radio.stopLabel, { name: station.name })} onClick={() => onPlay(null)}>
          {t.radio.stop}
        </button>
      ) : (
        <button className="filter" aria-label={fill(t.radio.playLabel, { name: station.name })} onClick={() => onPlay(station.id)}>
          {t.radio.play}
        </button>
      )}
    </li>
  );
}

export function RadioPanel({ playingId, onPlay }: Props) {
  const { t } = useStrings();
  const [stations, setStations] = useState<RadioStation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  // The station whose sound has started (it may take a few seconds to connect).
  const [heardId, setHeardId] = useState<string | null>(null);
  // The last station that would not play, to say so.
  const [brokenId, setBrokenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await fetchRadio();
        if (!cancelled) {
          setStations(result);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    const timer = setInterval(() => void load(), RELOAD_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  function play(id: string | null) {
    setBrokenId(null);
    onPlay(id);
  }

  // `?? null` turns "not found" into null (e.g. the station left the list).
  const playing = stations?.find((station) => station.id === playingId) ?? null;
  const broken = stations?.find((station) => station.id === brokenId) ?? null;
  const news = stations?.filter((station) => station.isNews) ?? [];
  const others = (stations?.length ?? 0) - news.length;
  const found = stations ? matchStations(stations, query) : { shown: [], total: 0 };

  return (
    <section className="panel panel-radio" aria-labelledby="radio-title">
      <div className="panel-head">
        <h2 id="radio-title">{t.radio.title}</h2>
        {playing && (
          <button className="filter" aria-pressed="true" aria-label={fill(t.radio.stopLabel, { name: playing.name })} onClick={() => play(null)}>
            {t.radio.stop}
          </button>
        )}
      </div>

      {/* Above the list, so the reader always sees what is playing. */}
      {playing && (
        <p className="radio-now" aria-live="polite">
          {fill(t.radio.playing, { name: playing.name })}
          {heardId !== playing.id && <span className="muted"> · {t.radio.connecting}</span>}
        </p>
      )}
      {broken && (
        <p className="radio-now notice" aria-live="polite">
          <WarnIcon /> {fill(t.radio.playFailed, { name: broken.name })}
        </p>
      )}
      {playing && (
        // No `controls`: the Play and Stop buttons are the controls. `key` gives
        // each station a fresh player, so the old stream is closed at once.
        <audio
          key={playing.id}
          src={playing.url}
          autoPlay
          onPlaying={() => setHeardId(playing.id)}
          onError={() => {
            setBrokenId(playing.id);
            onPlay(null);
          }}
        />
      )}

      <div className="panel-body">
        <p className="muted">{t.radio.note}</p>
        {failed && (
          <p className="notice">
            <WarnIcon /> {t.radio.failed}
          </p>
        )}
        {stations !== null && stations.length === 0 && !failed && <p className="muted">{t.radio.none}</p>}

        {news.length > 0 && (
          <>
            <h3>{t.radio.newsGroup}</h3>
            <ul className="plain-list">
              {news.map((station) => (
                <StationRow key={station.id} station={station} isPlaying={station.id === playingId} onPlay={play} t={t} />
              ))}
            </ul>
          </>
        )}

        {others > 0 && (
          <div className="radio-search">
            <h3>
              <label htmlFor="radio-query">{t.radio.searchLabel}</label>
            </h3>
            <input
              id="radio-query"
              type="search"
              value={query}
              placeholder={t.radio.searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
            {query.trim() === '' && <p className="muted">{fill(t.radio.searchHint, { count: others })}</p>}
            {query.trim() !== '' && found.total === 0 && <p className="muted">{t.radio.noMatch}</p>}
            {found.total > found.shown.length && (
              <p className="muted">{fill(t.radio.moreMatches, { shown: found.shown.length, total: found.total })}</p>
            )}
            {found.shown.length > 0 && (
              <ul className="plain-list">
                {found.shown.map((station) => (
                  <StationRow key={station.id} station={station} isPlaying={station.id === playingId} onPlay={play} t={t} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
