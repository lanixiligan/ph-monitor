// One shared way to clean up text before comparing it.

/**
 * Lower-case, no accents, only letters, digits and single spaces.
 * "Parañaque Flood!" becomes "paranaque flood". Matching on this text is
 * what makes the keyword, province and story checks "ignore case and accents".
 */
export function normalize(text: string): string {
  return text
    .normalize('NFD') // splits "ñ" into "n" + a separate accent mark
    .replace(/[̀-ͯ]/g, '') // ...and removes the accent marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True if `phrase` (already normalized) appears in `text` (normalized) as whole words. */
export function hasWords(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}
