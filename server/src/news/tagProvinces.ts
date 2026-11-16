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
// - "Manila time" and "Manila Bulletin" (outlet names) tag nothing.
// - "City of Isabela" (Basilan) and "Special Geographic Area" are not matched
//   by name. "Isabela City" tags Basilan.
// - Known noise: Aurora, Isabela, Rizal and Quezon are also people's names,
//   so a headline about a person can get a wrong tag. Regions ("Bicol",
//   "Eastern Visayas") are not tagged.

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
  // Volcanoes.
  { text: 'mayon', targets: ['albay'] },
  { text: 'kanlaon', targets: ['negros occidental', 'negros oriental'] },
  { text: 'taal', targets: ['batangas'] },
  { text: 'bulusan', targets: ['sorsogon'] },
  { text: 'hibok hibok', targets: ['camiguin'] },
];

// Phrases that contain a place name but are not about the place.
const NOT_PLACES = ['manila time', 'manila times', 'manila bulletin', 'manila standard', 'manila standard today'];

/** Returns the psgc codes (sorted, no repeats) of the provinces named in `headline`. */
export function tagProvinces(headline: string, provinces: ProvinceName[]): number[] {
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
  return [...found].sort((a, b) => a - b);
}
