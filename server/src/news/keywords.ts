// Decides whether a headline is about a natural disaster.
// English, Filipino and a few common Cebuano words. Matching is on whole
// words, ignoring case and accents, so "flood" does not match "floodlight".

import { normalize } from './text.ts';

// Each entry is a small pattern written on already-normalized text
// (lower-case, no accents, no punctuation). `s?` means "an optional s";
// `\d` means "one digit". Only whole words match.
export const DISASTER_KEYWORDS: string[] = [
  // Storms
  'typhoons?',
  'super typhoons?',
  'tropical storms?',
  'tropical depressions?',
  'tropical cyclones?',
  'storm surges?',
  'low pressure areas?',
  'lpa',
  'signal no \\d',
  'wind signals?',
  'habagat',
  'southwest monsoon',
  'heavy rains?',
  // Floods and landslides
  'floods?',
  'flooded',
  'flooding',
  'floodwaters?',
  'flash floods?',
  'landslides?',
  'mudslides?',
  // Earthquakes and tsunami
  'earthquakes?',
  'quakes?',
  'aftershocks?',
  'tsunamis?',
  // Volcanoes
  'volcanos?',
  'volcanoes',
  'volcanic',
  'eruptions?',
  'erupts?',
  'erupted',
  'erupting',
  'ashfall',
  'lahars?',
  'kanlaon',
  'mayon',
  // Response words
  'evacuations?',
  'evacuees?',
  'evacuated',
  'evacuate',
  'state of calamity',
  // Agencies
  'pagasa',
  'phivolcs',
  'ndrrmc',
  // Filipino: bagyo storm, baha flood, lindol earthquake, bulkan volcano,
  // daluyong surge, pagguho landslide, pagputok eruption
  'bagyo(?:ng)?',
  'baha',
  'lindol',
  'bulkan',
  'daluyong',
  'pagguho ng lupa',
  'pagputok ng bulkan',
  // Cebuano: linog earthquake, unos storm
  'linog',
  'unos',
];

// Phrases that contain a keyword but are not about a disaster. They are
// cut out of the headline before the keywords are checked.
// Left out on purpose: "amihan" (also a first name) and bare "storm"
// (sports teams, songs).
export const EXCLUDE_PHRASES: string[] = [
  'floods? of (?:complaints?|tears|messages?|praise|support|criticism|tourists?|cash|orders?)',
  'floods? (?:the )?(?:market|social media|timeline|feeds?)',
  'flooded with',
  'flooding (?:the )?(?:market|social media|timeline)',
  'floodlights?',
  'erupt(?:s|ed)? (?:in|with|into) (?:applause|cheers?|laughter|anger|joy|tears|violence|controversy|protest)',
  'eruptions? of (?:laughter|anger|violence|cheers|applause|joy|controversy)',
  'quake champions',
];

const keywordPattern = new RegExp(`(?:^| )(?:${DISASTER_KEYWORDS.join('|')})(?: |$)`);
const excludePattern = new RegExp(`(?:^| )(?:${EXCLUDE_PHRASES.join('|')})`, 'g');

// Quakes weaker than this are not news (several happen every hour).
const MIN_NEWS_MAGNITUDE = 4;

/** True if the headline is about a storm, flood, quake, volcano or similar. */
export function isDisasterHeadline(title: string): boolean {
  // "Weak mag. 2.1 earthquake - ..." style bulletins are dropped.
  const magnitude = /\bmag(?:nitude|\.)?\s?(\d(?:\.\d)?)/i.exec(title);
  if (magnitude && Number(magnitude[1]) < MIN_NEWS_MAGNITUDE) return false;

  // Cut out the false-positive phrases first, leaving a space behind.
  const text = normalize(title).replace(excludePattern, ' ');
  return keywordPattern.test(text);
}
