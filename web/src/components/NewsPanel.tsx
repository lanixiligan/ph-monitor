// Latest disaster headlines, with a filter by kind of disaster (typhoon,
// flood...). The map's headline dots follow the same filter.
// Headlines and links only: we never show article text.
// A headline that names a place gets a button that shows the place on the map.

import { useEffect, useState } from 'react';
import type { NewsItem } from '@ph-monitor/shared';
import { fetchNews } from '../api.ts';
import type { ProvinceCollection } from '../api.ts';
import { formatTime, NEWS_FILTER_IDS, newsTypeLabel, newsTypesText, safeUrl } from '../format.ts';
import { fill, useStrings } from '../i18n/index.ts';
import { WarnIcon } from './WarnIcon.tsx';

const REFRESH_MS = 5 * 60 * 1000;

type Props = {
  /** Province names come from here. null while the map is still loading. */
  provinces: ProvinceCollection | null;
  /** Called with a headline's province codes when the reader asks to see them. */
  onShowOnMap: (psgcs: number[]) => void;
  /** The chosen filter: 'all', a kind of disaster, or 'general'. */
  newsType: string;
  /** Called when the reader picks another filter. */
  onNewsTypeChange: (newsType: string) => void;
};

/** The place names for a headline. The four Metro Manila districts show as one "Metro Manila". */
function placeNames(psgcs: number[], nameByPsgc: Map<number, string>): string[] {
  const names = psgcs.flatMap((psgc) => nameByPsgc.get(psgc) ?? []);
  const shown = names.map((name) => (name.startsWith('NCR') ? 'Metro Manila' : name));
  // A Set keeps each name once.
  return [...new Set(shown)];
}

/** "📍 Albay, Sorsogon": shows the places on the map. Nothing when the headline names no place. */
function PlaceButton({ places, onClick }: { places: string; onClick: () => void }) {
  const { t } = useStrings();
  if (places === '') return null;
  return (
    <div>
      <button className="place-link" onClick={onClick} aria-label={fill(t.news.showOnMap, { places })}>
        {/* aria-hidden: screen readers skip the pin picture. */}
        <span className="place-pin" aria-hidden="true" />
        {places}
      </button>
    </div>
  );
}

export function NewsPanel({ provinces, onShowOnMap, newsType, onNewsTypeChange }: Props) {
  // `t` holds all the words in the current language.
  const { t } = useStrings();
  // `useState` keeps a value between renders. The text in <...> is its type.
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  // `useEffect` runs after the page draws; it reruns when `newsType` changes.
  useEffect(() => {
    // Stops an old answer from overwriting a newer one.
    let cancelled = false;
    async function load() {
      try {
        const result = await fetchNews(newsType, 30);
        if (!cancelled) {
          setItems(result);
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
  }, [newsType]);

  const nameByPsgc = new Map((provinces?.features ?? []).map((f) => [f.properties.psgc, f.properties.name]));

  return (
    <section className="panel panel-news" aria-labelledby="news-title">
      <div className="panel-head">
        <h2 id="news-title">{t.news.title}</h2>
      </div>
      <div className="panel-body">
      <p className="muted">{t.news.note}</p>
      <div className="filters" role="group" aria-label={t.news.filterLabel}>
        {NEWS_FILTER_IDS.map((id) => (
          <button
            key={id}
            className="filter"
            aria-pressed={newsType === id}
            onClick={() => onNewsTypeChange(id)}
          >
            {newsTypeLabel(id)}
          </button>
        ))}
      </div>

      {failed && (
        <p className="notice">
          <WarnIcon /> {t.news.failed}
        </p>
      )}
      {items !== null && items.length === 0 && !failed && <p className="muted">{t.news.none}</p>}
      {items !== null && items.length > 0 && (
        <ul className="plain-list">
          {items.map((item) => (
            <li key={item.id}>
              <a className="headline" href={safeUrl(item.url) ?? undefined} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
              <br />
              <span className="muted">
                {item.outlet} · {newsTypesText(item.types)} · {formatTime(item.publishedAt)}
              </span>
              <PlaceButton
                places={placeNames(item.provincePsgcs, nameByPsgc).join(', ')}
                onClick={() => onShowOnMap(item.provincePsgcs)}
              />
              {item.otherOutlets.length > 0 && (
                <div className="muted">
                  {t.news.alsoAt}{' '}
                  {item.otherOutlets.map((other, index) => (
                    <span key={other.url}>
                      {index > 0 && ', '}
                      <a href={safeUrl(other.url) ?? undefined} target="_blank" rel="noopener noreferrer">
                        {other.outlet}
                      </a>
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}
