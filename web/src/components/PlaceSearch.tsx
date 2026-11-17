// The search box over the map: type a city, municipality or province name,
// pick one from the list, and its status card opens. The names come from our
// own /api/places (no outside search service).
//
// It follows the "combobox" pattern, so it works by keyboard and with a
// screen reader: arrow keys move through the list, Enter picks, Escape closes.

import { useEffect, useId, useState } from 'react';
import type { PlaceMatch } from '@ph-monitor/shared';
import { searchPlaces } from '../api.ts';
import type { Spot } from '../api.ts';
import { useStrings } from '../i18n/index.ts';
import { WarnIcon } from './WarnIcon.tsx';

// Wait this long after the last key press before asking the server.
const WAIT_MS = 250;
const MIN_LETTERS = 2;

type Props = {
  onPick: (spot: Spot) => void;
  /** A message from the locate button (for example "outside the Philippines"). null = none. */
  note: string | null;
};

export function PlaceSearch({ onPick, note }: Props) {
  const { t } = useStrings();
  const [query, setQuery] = useState('');
  // The matches for what is typed. null = nothing asked yet; 'failed' = the search itself failed.
  const [matches, setMatches] = useState<PlaceMatch[] | 'failed' | null>(null);
  // Which row the arrow keys are on; -1 = none.
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  // useId gives a name that is unique on the page, to link the box to its list.
  const listId = useId();

  // Ask the server a moment after the reader stops typing.
  useEffect(() => {
    const text = query.trim();
    if (text.length < MIN_LETTERS) {
      setMatches(null);
      return;
    }
    // If the reader types again before the answer arrives, the old answer is dropped.
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchPlaces(text);
        if (!cancelled) setMatches(found);
      } catch {
        if (!cancelled) setMatches('failed');
      }
      if (!cancelled) setActive(-1);
    }, WAIT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const list = Array.isArray(matches) ? matches : [];
  const showList = open && list.length > 0;

  function pick(match: PlaceMatch) {
    onPick({ lat: match.lat, lon: match.lon });
    setQuery(match.name);
    setOpen(false);
  }

  // `React.KeyboardEvent` is the type of a key press on an element.
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (list.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // Stops the text cursor from jumping to the start or end of the box.
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // `%` wraps around: down from the last row goes to the first.
      setActive((current) => (current + step + list.length) % list.length);
    }
    if (event.key === 'Enter') {
      // Enter with no row chosen takes the first (best) match.
      const match = list[active] ?? list[0];
      if (match) pick(match);
    }
  }

  return (
    <div className="search" role="search">
      <input
        type="search"
        role="combobox"
        aria-label={t.search.label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={t.search.placeholder}
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Leaving the box closes the list.
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} className="search-list" role="listbox" aria-label={t.search.label} hidden={!showList}>
        {list.map((match, index) => (
          <li
            key={match.psgc}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            // Pressing the mouse would take the cursor out of the box and close
            // the list before the click arrives; preventDefault stops that.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(match)}
          >
            <span>{match.name}</span>
            <span className="muted">{match.provinceName ?? t.search.province}</span>
          </li>
        ))}
      </ul>
      {/* role="status" makes a screen reader read these out when they appear. */}
      <div role="status">
        {open && Array.isArray(matches) && matches.length === 0 && <p className="search-note">{t.search.none}</p>}
        {matches === 'failed' && (
          <p className="search-note">
            <WarnIcon /> {t.search.failed}
          </p>
        )}
        {note !== null && (
          <p className="search-note">
            <WarnIcon /> {note}
          </p>
        )}
      </div>
    </div>
  );
}
