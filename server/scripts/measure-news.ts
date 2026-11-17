// Measures the news rules against real headlines labelled by hand
// (test/fixtures/news/labelled-headlines.json). Run with: npm run measure:news
// It reads three files and prints numbers; no database, no internet.
//
//   Filter:  of the headlines it keeps, how many are really about a disaster,
//            and how many disaster headlines it misses.
//   Types:   for disaster headlines it keeps, whether the kinds of disaster
//            (typhoon, flood, ...) are the ones a person would pick.
//   Places:  for disaster headlines, whether the provinces it tags are the
//            ones a person would pick.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkHeadline } from '../src/news/checkHeadline.ts';
import type { ProvinceName, TownName } from '../src/news/tagProvinces.ts';

type Labelled = { title: string; outlet: string; disaster: boolean; types: string[]; provinces: string[]; note?: string };

const dir = path.resolve(import.meta.dirname, '../test/fixtures/news');
// `as` tells TypeScript the shape of what is in the files.
const headlines = JSON.parse(readFileSync(path.join(dir, 'labelled-headlines.json'), 'utf8')) as Labelled[];
const provinces = JSON.parse(readFileSync(path.join(dir, 'provinces.json'), 'utf8')) as ProvinceName[];
const towns = JSON.parse(readFileSync(path.join(dir, 'towns.json'), 'utf8')) as TownName[];
// No storm names: those come from the database while a storm is around.
const context = { provinces, towns, storms: [] };
const tag = (title: string) => checkHeadline(title, context).provincePsgcs;
const nameOf = new Map(provinces.map((province) => [province.psgc, province.name]));

const percent = (part: number, whole: number) => (whole === 0 ? 'n/a' : `${Math.round((100 * part) / whole)}%`);
const short = (title: string) => (title.length > 110 ? `${title.slice(0, 110)}…` : title);

// The same check the news job uses: places first, then the filter.
const check = (title: string) => checkHeadline(title, context);

// ---------- Filter ----------
const kept = headlines.filter((headline) => check(headline.title).disaster);
const wronglyKept = kept.filter((headline) => !headline.disaster);
const missed = headlines.filter((headline) => headline.disaster && !check(headline.title).disaster);
const disasters = headlines.filter((headline) => headline.disaster);

console.log(`Headlines: ${headlines.length} (${disasters.length} about a disaster, ${headlines.length - disasters.length} not)\n`);
console.log('FILTER');
console.log(`  kept ${kept.length}; really about a disaster: ${kept.length - wronglyKept.length} (${percent(kept.length - wronglyKept.length, kept.length)})`);
console.log(`  disaster headlines found: ${disasters.length - missed.length} of ${disasters.length} (${percent(disasters.length - missed.length, disasters.length)})`);
console.log(`\n  Kept by mistake (${wronglyKept.length}):`);
for (const headline of wronglyKept) console.log(`    - ${short(headline.title)}${headline.note ? `  [${headline.note}]` : ''}`);
console.log(`\n  Missed (${missed.length}):`);
for (const headline of missed) console.log(`    - ${short(headline.title)}  [${headline.types.join(', ') || 'general'}]`);

// ---------- Types ----------
const keptDisasters = kept.filter((headline) => headline.disaster);
const typeMisses: string[] = [];
for (const headline of keptDisasters) {
  const got = [...check(headline.title).types].sort().join(', ') || 'general';
  const want = [...headline.types].sort().join(', ') || 'general';
  if (got !== want) typeMisses.push(`    - ${short(headline.title)}\n        got: ${got}; wanted: ${want}`);
}
console.log('\nTYPES (disaster headlines it keeps)');
console.log(`  kinds exactly right: ${keptDisasters.length - typeMisses.length} of ${keptDisasters.length} (${percent(keptDisasters.length - typeMisses.length, keptDisasters.length)})`);
console.log(`\n  Not exactly right (${typeMisses.length}):`);
for (const line of typeMisses) console.log(line);

// ---------- Places ----------
let exact = 0;
const wrong: string[] = [];
for (const headline of disasters) {
  const got = tag(headline.title).map((psgc) => nameOf.get(psgc) ?? String(psgc)).sort();
  const want = [...headline.provinces].sort();
  if (got.join('|') === want.join('|')) {
    exact += 1;
    continue;
  }
  const extra = got.filter((name) => !want.includes(name));
  const lacking = want.filter((name) => !got.includes(name));
  wrong.push(
    `    - ${short(headline.title)}\n        ` +
      [extra.length > 0 ? `wrongly tagged: ${extra.join(', ')}` : '', lacking.length > 0 ? `not tagged: ${lacking.join(', ')}` : '']
        .filter((part) => part !== '')
        .join('; '),
  );
}
console.log('\nPLACES (disaster headlines only)');
console.log(`  provinces exactly right: ${exact} of ${disasters.length} (${percent(exact, disasters.length)})`);
console.log(`\n  Not exactly right (${wrong.length}):`);
for (const line of wrong) console.log(line);
