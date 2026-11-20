// The top bar's view switch: Overall, then one button per hazard, in the order
// of MAP_VIEWS (shared/src/mapViews.ts). Only one is pressed at a time, so two
// warm colour scales never show at once. Views marked 'more' sit in a small
// "More" menu. A view with no data behind it is greyed out with a note and
// can't be pressed. Display only: pressing a button never changes the score.

import { useEffect, useRef, useState } from 'react';
// `import type` brings in types only; they vanish when the code runs.
import type { ReactNode } from 'react';
import { MAP_VIEWS } from '@ph-monitor/shared';
import type { MapView, MapViewId } from '@ph-monitor/shared';
import { fill, lookup, useStrings } from '../i18n/index.ts';

type Props = {
  /** The pressed view. */
  view: MapViewId;
  /** Called with the view the reader presses (never with a greyed-out one). */
  onPress: (view: MapViewId) => void;
};

/** The id of a view's button, so other parts can move the keyboard back to it. */
export function viewButtonId(id: MapViewId): string {
  return `view-button-${id}`;
}

// One small drawing per icon name, in the text colour (currentColor).
// `Record<MapView['icon'], ReactNode>` = one drawing for each value a view's `icon` can have.
const ICONS: Record<MapView['icon'], ReactNode> = {
  // Four rising bars, like the score ladder.
  overall: <path d="M2.5 14v-3M6 14V8.5M9.5 14V6M13 14V3" strokeWidth="2.2" />,
  // A thermometer.
  heat: (
    <>
      <path d="M6.5 9.4V3a1.5 1.5 0 0 1 3 0v6.4a3 3 0 1 1-3 0z" strokeWidth="1.4" />
      <circle cx="8" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  // A seismograph line.
  earthquake: <path d="M1 8.5h3l1.5-4 2 8 2-10 1.5 6H15" strokeWidth="1.5" />,
  // Two waves.
  tsunami: (
    <path d="M1 7c1.75 0 1.75-2 3.5-2S6.25 7 8 7s1.75-2 3.5-2S13.25 7 15 7M1 12c1.75 0 1.75-2 3.5-2s1.75 2 3.5 2 1.75-2 3.5-2 1.75 2 3.5 2" strokeWidth="1.5" />
  ),
};

function ViewIcon({ name }: { name: MapView['icon'] }) {
  return (
    // aria-hidden: the word next to it says the same.
    <svg className="view-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** One view's button: icon and word; a greyed-out view also shows its note. */
function ViewButton({ view, pressed, onPress }: { view: MapView; pressed: boolean; onPress: (id: MapViewId) => void }) {
  const { t } = useStrings();
  return (
    <button
      id={viewButtonId(view.id)}
      type="button"
      className="view-button"
      // aria-disabled (not `disabled`) keeps a greyed-out button reachable by
      // the keyboard, so its note can still be read.
      aria-pressed={view.available ? pressed : undefined}
      aria-disabled={view.available ? undefined : true}
      onClick={() => {
        if (view.available) onPress(view.id);
      }}
    >
      <ViewIcon name={view.icon} />
      <span>{t.views.names[view.id]}</span>
      {!view.available && <span className="view-note">{lookup(t.views.notes, view.id, t.views.noData)}</span>}
    </button>
  );
}

/** "More ▾": a button that opens a small list of the other views. */
function MoreMenu({ views, current, onPress }: { views: MapView[]; current: MapViewId; onPress: (id: MapViewId) => void }) {
  const { t } = useStrings();
  const [open, setOpen] = useState(false);
  // `<HTMLDivElement>` says what the ref will hold: a div.
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // The pressed view, when it is one of the menu's: the More button names it.
  const pressedHere = views.find((view) => view.id === current);

  // While open: a click outside or Escape closes the list.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      // `as Node` tells TypeScript the click target is a part of the page;
      // `?.` skips the check (gives undefined) while the ref is still empty.
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function press(id: MapViewId) {
    onPress(id);
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div
      ref={wrapRef}
      className="view-more"
      // Tabbing out of the menu closes it too.
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next !== null && !wrapRef.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={pressedHere ? 'view-button view-more-button holds-pressed' : 'view-button view-more-button'}
        aria-expanded={open}
        aria-controls="view-more-list"
        onClick={() => setOpen(!open)}
      >
        {pressedHere ? fill(t.views.moreHolding, { view: t.views.names[pressedHere.id] }) : t.views.more}
        <span aria-hidden="true">▾</span>
      </button>
      {/* `hidden` keeps the list in the page but out of sight and out of the Tab order. */}
      <ul id="view-more-list" className="view-menu" hidden={!open}>
        {views.map((view) => (
          <li key={view.id}>
            <ViewButton view={view} pressed={view.id === current} onPress={press} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ViewSwitch({ view, onPress }: Props) {
  const { t } = useStrings();
  const row = MAP_VIEWS.filter((item) => item.place === 'row');
  const more = MAP_VIEWS.filter((item) => item.place === 'more');
  return (
    // The outer box places the More list; the inner row scrolls sideways on a
    // narrow screen without cutting the list off.
    <div className="view-switch">
      <div className="view-row" role="group" aria-label={t.views.groupLabel}>
        {row.map((item) => (
          <ViewButton key={item.id} view={item} pressed={item.id === view} onPress={onPress} />
        ))}
        {more.length > 0 && <MoreMenu views={more} current={view} onPress={onPress} />}
      </div>
    </div>
  );
}
