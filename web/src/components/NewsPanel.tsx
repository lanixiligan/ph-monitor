// Latest disaster headlines, with a filter by outlet group.
// Headlines and links only: we never show article text.

import { useEffect, useState } from 'react';
import type { NewsItem } from '@ph-monitor/shared';
import { fetchNews } from '../api.ts';
import { CATEGORY_IDS, categoryLabel, formatTime, safeUrl } from '../format.ts';
import { useStrings } from '../i18n/index.ts';

const REFRESH_MS = 5 * 60 * 1000;
// 'all' first, then the outlet groups. `...` spreads one list into another.
const FILTER_IDS = ['all', ...CATEGORY_IDS];

// This component takes no props, so it can be placed anywhere on the page.
export function NewsPanel() {
  // `t` holds all the words in the current language.
  const { t } = useStrings();
  // `useState` keeps a value between renders. The text in <...> is its type.
  const [category, setCategory] = useState<string>('all');
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  // `useEffect` runs after the page draws; it reruns when `category` changes.
  useEffect(() => {
    // Stops an old answer from overwriting a newer one.
    let cancelled = false;
    async function load() {
      try {
        const result = await fetchNews(category, 30);
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
  }, [category]);

  return (
    <section className="panel" aria-labelledby="news-title">
      <h2 id="news-title">{t.news.title}</h2>
      <p className="muted">{t.news.note}</p>
      <div className="filters" role="group" aria-label={t.news.filterLabel}>
        {FILTER_IDS.map((id) => (
          <button
            key={id}
            className="filter"
            aria-pressed={category === id}
            onClick={() => setCategory(id)}
          >
            {categoryLabel(id)}
          </button>
        ))}
      </div>

      {failed && <p className="muted">{t.news.failed}</p>}
      {items !== null && items.length === 0 && !failed && <p className="muted">{t.news.none}</p>}
      {items !== null && items.length > 0 && (
        <ul className="plain-list">
          {items.map((item) => (
            <li key={item.id}>
              <a href={safeUrl(item.url) ?? undefined} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
              <br />
              <span className="muted">
                {item.outlet} · {categoryLabel(item.category)} · {formatTime(item.publishedAt)}
              </span>
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
    </section>
  );
}
