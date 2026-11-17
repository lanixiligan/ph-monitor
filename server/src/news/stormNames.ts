// Names of storms seen lately, so a headline that names only the storm
// ("'Uwan' leaves 5 dead") still counts as typhoon news.
// PAGASA's cyclone alerts carry both names: "Typhoon Samuel (CEMPAKA)".
// The local name is often also a person's name, so it counts only in quotes.

import type { StormName } from './keywords.ts';

// "Typhoon Samuel (CEMPAKA)": the class, the local name, then the
// international name in brackets (optional). `[\w-]+` = one word, hyphens allowed.
const CYCLONE_NAME =
  /(?:super typhoon|typhoon|severe tropical storm|tropical storm|tropical depression)\s+([A-Za-z][\w-]+)(?:\s*\(([A-Za-z][\w-]+)\))?/i;

/** Storm names found in PAGASA alert headlines. */
export function stormNamesFromAlerts(headlines: string[]): StormName[] {
  const names: StormName[] = [];
  for (const headline of headlines) {
    const match = CYCLONE_NAME.exec(headline);
    if (!match?.[1]) continue;
    names.push({ name: match[1], needsQuotes: true });
    if (match[2]) names.push({ name: match[2], needsQuotes: false });
  }
  return names;
}
