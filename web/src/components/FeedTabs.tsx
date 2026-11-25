// The right column's three tabs: Live news, Radio and Headlines. One panel shows
// at a time (App.tsx); the others stay loaded, so a sound keeps playing while the
// reader reads headlines. The tab whose sound is playing shows a small dot.
// Keyboard: Tab reaches the chosen tab, the arrows (and Home, End) move along the row.

import { useRef } from 'react';
// `import type` brings in types only; they vanish when the code runs.
import type { KeyboardEvent } from 'react';
import { FEED_TABS, nextTab } from '../feedTabs.ts';
import type { FeedTab } from '../feedTabs.ts';
import { useStrings } from '../i18n/index.ts';

type Props = {
  /** The tab that shows now. */
  tab: FeedTab;
  /** Called with the tab the reader picks. */
  onPick: (tab: FeedTab) => void;
  /** The tab whose sound is playing, or null. */
  playing: FeedTab | null;
};

/** The ids that tie a tab to its panel (App.tsx uses them too). */
export const feedTabId = (tab: FeedTab) => `feed-tab-${tab}`;
export const feedPanelId = (tab: FeedTab) => `feed-panel-${tab}`;

export function FeedTabs({ tab, onPick, playing }: Props) {
  const { t } = useStrings();
  // The row, so the arrow keys can move the keyboard to the new tab.
  const rowRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent) {
    const next = nextTab(tab, event.key);
    if (next === null) return;
    // The arrows would otherwise scroll the page.
    event.preventDefault();
    onPick(next);
    rowRef.current?.querySelector<HTMLButtonElement>(`#${feedTabId(next)}`)?.focus();
  }

  return (
    <div ref={rowRef} id="feed-tabs" className="feed-tabs" role="tablist" aria-label={t.feedTabs.groupLabel} onKeyDown={onKeyDown}>
      {FEED_TABS.map((id) => (
        <button
          key={id}
          id={feedTabId(id)}
          type="button"
          role="tab"
          className="feed-tab"
          aria-selected={id === tab}
          aria-controls={feedPanelId(id)}
          // Only the chosen tab is in the Tab order; the arrows reach the others.
          tabIndex={id === tab ? 0 : -1}
          onClick={() => onPick(id)}
        >
          {t.feedTabs.names[id]}
          {id === playing && (
            <>
              {/* aria-hidden: the hidden words below say the same to a screen reader. */}
              <span className="feed-tab-dot" aria-hidden="true" />
              <span className="visually-hidden"> {t.feedTabs.playing}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
