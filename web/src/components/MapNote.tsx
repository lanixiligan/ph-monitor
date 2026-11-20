// A short note over the bottom-left of the map, while the pressed view has
// nothing (or not all) to show: no storm tracked, the storm feed down or old,
// the zones too far out to draw. So an empty map never looks calm. Missing or
// old data gets the WarnIcon and words, never a warm colour. Which note shows
// is decided in mapNotes.ts.

// `import type` brings in types only; they vanish when the code runs.
import type { MapNoteId } from '../mapNotes.ts';
import { isWarnNote } from '../mapNotes.ts';
import { useStrings } from '../i18n/index.ts';
import type { Strings } from '../i18n/index.ts';
import { WarnIcon } from './WarnIcon.tsx';

/** The words for each note. */
function noteText(id: MapNoteId, t: Strings): string {
  switch (id) {
    case 'stormsLoading':
      return t.typhoon.loading;
    case 'stormsFailed':
      return t.typhoon.loadError;
    case 'stormsStale':
      return t.typhoon.stale;
    case 'stormsUnchecked':
      return t.typhoon.unchecked;
    case 'stormsNone':
      return t.typhoon.none;
    case 'stormsHidden':
      return t.typhoon.hidden;
    case 'surgeHidden':
      return t.stormSurge.hidden;
    case 'surgeZoomIn':
      return t.legend.zoomIn;
  }
}

/** `note` null draws nothing. `{ note }: { ... }` takes the one prop and says its type. */
export function MapNote({ note }: { note: MapNoteId | null }) {
  const { t } = useStrings();
  if (note === null) return null;
  return (
    // role="status": a screen reader reads the note out when it appears or changes.
    <p className="map-note notice" role="status">
      {isWarnNote(note) && <WarnIcon />}
      <span>{noteText(note, t)}</span>
    </p>
  );
}
