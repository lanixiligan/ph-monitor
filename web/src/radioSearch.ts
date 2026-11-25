// Which radio stations match what the reader typed in the radio panel's search box.

import type { RadioStation } from '@ph-monitor/shared';

/** At most this many matches are drawn; the reader types more to narrow it down. */
export const MAX_MATCHES = 30;

/** Lower case, accents dropped ("Parañaque" → "paranaque"), spaces squeezed. */
function plain(text: string): string {
  // NFD splits "ñ" into "n" + a separate accent mark; the regex then drops the marks.
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The stations outside the news group whose name or place holds every typed word.
 * Pure. Stations keep their order (most votes first). An empty query matches nothing.
 */
export function matchStations(stations: RadioStation[], query: string): { shown: RadioStation[]; total: number } {
  const words = plain(query).split(' ').filter((word) => word !== '');
  if (words.length === 0) return { shown: [], total: 0 };
  const matches = stations.filter((station) => {
    if (station.isNews) return false;
    const haystack = plain(`${station.name} ${station.place ?? ''}`);
    return words.every((word) => haystack.includes(word));
  });
  return { shown: matches.slice(0, MAX_MATCHES), total: matches.length };
}
