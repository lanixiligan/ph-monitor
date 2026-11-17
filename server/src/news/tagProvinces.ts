// Finds which provinces a headline names. Whole words, ignoring case and accents.
//
// Rules:
// - The longest name wins, and matched words are used up. "Davao del Sur"
//   never also tags "Davao"; "Quezon City" never tags Quezon province;
//   "Northern Samar" never tags Samar.
// - Metro Manila: "Metro Manila", "NCR" or "National Capital Region" tag all
//   four NCR district rows. A bare "Manila" tags only the first district (the
//   City of Manila). A named city (Makati, Pasig...) tags its own district.
// - A bare "Davao" or "Zamboanga" tags Davao del Sur / Zamboanga del Sur,
//   where Davao City and Zamboanga City are. "Maguindanao", "Negros",
//   "Mindoro" and "Ilocos" tag every province that starts with that name.
// - A short list of cities and volcanoes tags the province they are in
//   (Cebu City -> Cebu, Tacloban -> Leyte, Mayon -> Albay...).
// - Islands and other spellings: Pagasa Island -> Palawan, Siargao -> Surigao
//   del Norte, Maynila -> City of Manila, Rizal Park -> City of Manila.
// - "Manila time", "Manila Bulletin" (outlet names), "Manila Trench" (a sea
//   trench) and people and streets named after places ("Jose Rizal",
//   "Manuel Quezon", "Aurora Boulevard") tag nothing.
// - Towns and cities (from the places table, when given): a town tags its
//   province only when the headline uses the name as a place: first in the
//   headline, after "in", "of", "sa"..., or before "City" or "town". A name
//   shared by towns in two provinces is skipped, and so are town names that
//   are also surnames or common words (NOT_TOWNS).
// - "City of Isabela" (Basilan) and "Special Geographic Area" are not matched
//   by name. "Isabela City" tags Basilan.
// - Known noise: a person named after a province who is not on the list
//   below can still get a wrong tag. Regions ("Bicol", "Eastern Visayas")
//   are not tagged.

import { normalize } from './text.ts';

export type ProvinceName = { psgc: number; name: string };

// Names that are never matched as they are written in the table.
const SKIPPED_NAMES = ['city of isabela', 'special geographic area'];

// Extra spellings. `text` and `targets` are normalized province names;
// a target that matches no row (for example a table without NCR) is ignored.
const NCR_ALL = ['ncr city of manila first district', 'ncr second district', 'ncr third district', 'ncr fourth district'];
const NCR_FIRST = ['ncr city of manila first district'];
const NCR_SECOND = ['ncr second district'];
const NCR_THIRD = ['ncr third district'];
const NCR_FOURTH = ['ncr fourth district'];

const ALIASES: { text: string; targets: string[] }[] = [
  { text: 'metro manila', targets: NCR_ALL },
  { text: 'ncr', targets: NCR_ALL },
  { text: 'national capital region', targets: NCR_ALL },
  { text: 'manila', targets: NCR_FIRST },
  ...['mandaluyong', 'marikina', 'pasig', 'quezon city', 'san juan'].map((text) => ({ text, targets: NCR_SECOND })),
  ...['caloocan', 'malabon', 'navotas', 'valenzuela'].map((text) => ({ text, targets: NCR_THIRD })),
  ...['las pinas', 'makati', 'muntinlupa', 'paranaque', 'pasay', 'pateros', 'taguig'].map((text) => ({
    text,
    targets: NCR_FOURTH,
  })),
  { text: 'davao', targets: ['davao del sur'] },
  { text: 'davao city', targets: ['davao del sur'] },
  { text: 'davao region', targets: ['davao del norte', 'davao del sur', 'davao de oro', 'davao occidental', 'davao oriental'] },
  { text: 'compostela valley', targets: ['davao de oro'] },
  { text: 'zamboanga', targets: ['zamboanga del sur'] },
  { text: 'zamboanga city', targets: ['zamboanga del sur'] },
  { text: 'maguindanao', targets: ['maguindanao del norte', 'maguindanao del sur'] },
  { text: 'cotabato city', targets: ['maguindanao del norte'] },
  { text: 'north cotabato', targets: ['cotabato'] },
  { text: 'negros', targets: ['negros occidental', 'negros oriental'] },
  { text: 'mindoro', targets: ['occidental mindoro', 'oriental mindoro'] },
  { text: 'ilocos', targets: ['ilocos norte', 'ilocos sur'] },
  { text: 'isabela city', targets: ['basilan'] },
  { text: 'city of isabela', targets: ['basilan'] },
  { text: 'dinagat', targets: ['dinagat islands'] },
  // Cities that clearly imply a province.
  { text: 'cebu city', targets: ['cebu'] },
  { text: 'mandaue', targets: ['cebu'] },
  { text: 'lapu lapu', targets: ['cebu'] },
  { text: 'tacloban', targets: ['leyte'] },
  { text: 'ormoc', targets: ['leyte'] },
  { text: 'legazpi', targets: ['albay'] },
  { text: 'baguio', targets: ['benguet'] },
  { text: 'bacolod', targets: ['negros occidental'] },
  { text: 'dumaguete', targets: ['negros oriental'] },
  { text: 'cagayan de oro', targets: ['misamis oriental'] },
  { text: 'iligan', targets: ['lanao del norte'] },
  { text: 'marawi', targets: ['lanao del sur'] },
  { text: 'general santos', targets: ['south cotabato'] },
  { text: 'koronadal', targets: ['south cotabato'] },
  { text: 'kidapawan', targets: ['cotabato'] },
  { text: 'butuan', targets: ['agusan del norte'] },
  { text: 'puerto princesa', targets: ['palawan'] },
  { text: 'laoag', targets: ['ilocos norte'] },
  { text: 'vigan', targets: ['ilocos sur'] },
  { text: 'tuguegarao', targets: ['cagayan'] },
  { text: 'santiago city', targets: ['isabela'] },
  { text: 'olongapo', targets: ['zambales'] },
  { text: 'angeles city', targets: ['pampanga'] },
  { text: 'lucena', targets: ['quezon'] },
  { text: 'antipolo', targets: ['rizal'] },
  { text: 'calamba', targets: ['laguna'] },
  { text: 'dagupan', targets: ['pangasinan'] },
  { text: 'tagbilaran', targets: ['bohol'] },
  { text: 'catbalogan', targets: ['samar'] },
  { text: 'calbayog', targets: ['samar'] },
  { text: 'borongan', targets: ['eastern samar'] },
  { text: 'roxas city', targets: ['capiz'] },
  { text: 'kalibo', targets: ['aklan'] },
  { text: 'surigao city', targets: ['surigao del norte'] },
  { text: 'dipolog', targets: ['zamboanga del norte'] },
  { text: 'pagadian', targets: ['zamboanga del sur'] },
  { text: 'tagum', targets: ['davao del norte'] },
  { text: 'digos', targets: ['davao del sur'] },
  { text: 'jolo', targets: ['sulu'] },
  // Islands, landmarks and other spellings.
  { text: 'maynila', targets: NCR_FIRST },
  { text: 'rizal park', targets: NCR_FIRST },
  { text: 'luneta', targets: NCR_FIRST },
  { text: 'quezon memorial circle', targets: NCR_SECOND },
  { text: 'pagasa island', targets: ['palawan'] },
  { text: 'kalayaan island group', targets: ['palawan'] },
  { text: 'siargao', targets: ['surigao del norte'] },
  // Volcanoes.
  { text: 'mayon', targets: ['albay'] },
  { text: 'kanlaon', targets: ['negros occidental', 'negros oriental'] },
  { text: 'taal', targets: ['batangas'] },
  { text: 'bulusan', targets: ['sorsogon'] },
  { text: 'hibok hibok', targets: ['camiguin'] },
];

// Phrases that contain a place name but are not about the place.
const NOT_PLACES = [
  'manila time',
  'manila times',
  'manila bulletin',
  'manila standard',
  'manila standard today',
  'manila trench',
  // People, streets and buildings named after a province's namesake.
  'jose rizal',
  'jose p rizal',
  'dr jose rizal',
  'dr jose p rizal',
  'rizal avenue',
  'rizal ave',
  'rizal day',
  'rizal monument',
  'rizal memorial',
  'rizal shrine',
  'rizal street',
  'rizal st',
  'rizal technological university',
  'rizal medical center',
  'manuel quezon',
  'manuel l quezon',
  'manuel luis quezon',
  'quezon avenue',
  'quezon ave',
  'quezon boulevard',
  'quezon blvd',
  'quezon memorial',
  'aurora boulevard',
  'aurora blvd',
  'aurora borealis',
];

/** A city or municipality from the places table, and the province it is in. */
export type TownName = { name: string; provincePsgc: number };

// Town names that are also surnames, first names, foreign places or common
// English, Filipino or Cebuano words. They are never used to tag a province.
const NOT_TOWNS = new Set([
  // Surnames and first names.
  'adams', 'aguilar', 'aguinaldo', 'akbar', 'alfonso', 'allen', 'amadeo', 'asuncion', 'bautista', 'cervantes',
  'claver', 'conner', 'flora', 'gloria', 'imelda', 'isabel', 'ivana', 'javier', 'jimenez', 'jones', 'josefina',
  'julita', 'laurel', 'leon', 'lopez', 'macarthur', 'magdalena', 'marcos', 'maria', 'medina', 'mendez',
  'natividad', 'omar', 'perez', 'ramon', 'ramos', 'rodriguez', 'rosales', 'salvador', 'sara', 'taft', 'teresa',
  'trinidad', 'villanueva',
  // Places abroad.
  'almeria', 'barcelona', 'boston', 'cadiz', 'cordova', 'goa', 'jordan', 'madrid', 'medellin', 'merida',
  'mexico', 'murcia', 'santander', 'toledo', 'valladolid', 'zaragoza', 'angeles',
  // English words.
  'bay', 'dingle', 'labrador', 'loon', 'malay', 'naval', 'orion', 'real', 'santa', 'sigma', 'cordon',
  // Filipino and Cebuano words (bantay guard, gubat forest, iba other, oras time, gamay small...).
  'bantay', 'gubat', 'iba', 'oras', 'gamay', 'pili', 'santol', 'tuba', 'bani', 'lupi', 'upi', 'tupi', 'bula',
  'lala', 'palo', 'pola', 'lila', 'mina', 'pata', 'dao', 'bago', 'lobo', 'baco', 'luba', 'panay', 'samal', 'angat',
]);

// Words that, right before a town name, show it is used as a place...
const TOWN_BEFORE = new Set([
  'in', 'sa', 'ng', 'of', 'at', 'from', 'near', 'to', 'off', 'around', 'across', 'inside', 'outside', 'within',
  'into', 'hits', 'hit', 'jolts', 'rocks', 'shakes',
]);
// ...and right after it.
const TOWN_AFTER = new Set(['city', 'town', 'municipality']);

// "City of Tabaco" and "Tabaco City" are both written "tabaco" here.
// Brackets ("Lapu-Lapu City (Opon)") are left out.
function townText(name: string): string {
  return normalize(name.replace(/\(.*?\)/g, ' '))
    .replace(/^city of /, '')
    .replace(/ city$/, '');
}

/**
 * Returns the psgc codes (sorted, no repeats) of the provinces named in `headline`.
 * `towns` (optional, from the places table) lets a town or city name its province.
 */
export function tagProvinces(headline: string, provinces: ProvinceName[], towns: TownName[] = []): number[] {
  // Patterns to look for, each with the psgc codes it stands for.
  const patterns: { text: string; psgcs: number[] }[] = [];
  const psgcsByName = new Map<string, number[]>();

  for (const province of provinces) {
    const name = normalize(province.name);
    psgcsByName.set(name, [province.psgc]);
    // NCR district rows are only reached through the aliases below.
    if (SKIPPED_NAMES.includes(name) || name.startsWith('ncr ')) continue;
    patterns.push({ text: name, psgcs: [province.psgc] });
  }
  for (const alias of ALIASES) {
    const psgcs = alias.targets.flatMap((target) => psgcsByName.get(target) ?? []);
    if (psgcs.length > 0) patterns.push({ text: alias.text, psgcs });
  }

  for (const text of NOT_PLACES) patterns.push({ text, psgcs: [] });

  // Longest first, so "davao del sur" is used up before "davao" can match.
  patterns.sort((a, b) => b.text.length - a.text.length);

  let text = ` ${normalize(headline)} `;
  const found = new Set<number>();
  for (const pattern of patterns) {
    const needle = ` ${pattern.text} `;
    if (!text.includes(needle)) continue;
    for (const psgc of pattern.psgcs) found.add(psgc);
    // Mark every use of the name as used up ("_" never occurs in normalized text).
    text = text.split(needle).join(` ${'_'.repeat(needle.length - 2)} `);
  }

  // Towns last, on what is left. Names already used above are skipped.
  const usedTexts = new Set(patterns.map((pattern) => pattern.text));
  for (const town of usableTowns(towns, usedTexts)) {
    text = tagTown(text, town, found);
  }
  return [...found].sort((a, b) => a - b);
}

// Town names that point to exactly one province, longest first.
function usableTowns(towns: TownName[], usedTexts: Set<string>): { text: string; psgc: number }[] {
  const provincesByText = new Map<string, Set<number>>();
  for (const town of towns) {
    const text = townText(town.name);
    if (text === '' || NOT_TOWNS.has(text) || usedTexts.has(text)) continue;
    const set = provincesByText.get(text) ?? new Set<number>();
    set.add(town.provincePsgc);
    provincesByText.set(text, set);
  }
  const usable: { text: string; psgc: number }[] = [];
  for (const [text, psgcs] of provincesByText) {
    const [psgc] = [...psgcs];
    if (psgcs.size === 1 && psgc !== undefined) usable.push({ text, psgc });
  }
  return usable.sort((a, b) => b.text.length - a.text.length);
}

// Adds the town's province to `found` when the headline uses the name as a
// place, and returns the text with the name used up.
function tagTown(text: string, town: { text: string; psgc: number }, found: Set<number>): string {
  if (!text.includes(` ${town.text} `)) return text;
  const words = text.trim().split(' ');
  const name = town.text.split(' ');
  for (let i = 0; i + name.length <= words.length; i += 1) {
    if (name.some((word, k) => words[i + k] !== word)) continue;
    const before = words[i - 1];
    const after = words[i + name.length];
    const usedAsPlace =
      i === 0 || (before !== undefined && TOWN_BEFORE.has(before)) || (after !== undefined && TOWN_AFTER.has(after));
    if (!usedAsPlace) continue;
    found.add(town.psgc);
    for (let k = 0; k < name.length; k += 1) words[i + k] = '_';
  }
  return ` ${words.join(' ')} `;
}
