// Latest disaster headlines, with a filter by outlet group.
// Headlines and links only: we never show article text.

import { useEffect, useState } from 'react';
import type { NewsItem } from '@ph-monitor/shared';
import { fetchNews } from '../api.ts';
import { CATEGORY_LABELS, categoryLabel, formatTime, safeUrl } from '../format.ts';

const REFRESH_MS = 5 * 60 * 1000;
const FILTERS = [{ id: 'all', label: 'All' }, ...CATEGORY_LABELS];

// This component takes no props, so it can be placed anywhere on the page.
export function NewsPanel() {
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
      <h2 id="news-title">Disaster headlines</h2>
      <p className="muted">
        The group is only a label for the kind of outlet. It is not a ranking of how far to trust it.
      </p>
      <div className="filters" role="group" aria-label="Filter by outlet group">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            className="filter"
            aria-pressed={category === filter.id}
            onClick={() => setCategory(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {failed && <p className="muted">Could not load headlines right now.</p>}
      {items !== null && items.length === 0 && !failed && <p className="muted">No headlines to show.</p>}
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
                  Also at:{' '}
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
