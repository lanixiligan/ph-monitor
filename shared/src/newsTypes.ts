// The kinds of natural disaster a headline can be about, in the order the
// headlines panel shows its buttons. The owner's list of eight, plus extreme heat.
// A headline about a disaster with none of these (for example only an
// evacuation or a state of calamity) is "general".

// `as const` keeps the exact words, so `NewsType` below is one of these nine.
export const NEWS_TYPES = [
  'typhoon', // typhoons and tropical cyclones
  'flood', // floods (and heavy rain)
  'earthquake',
  'volcano',
  'landslide',
  'tsunami', // tsunamis and storm surges
  'drought', // droughts, dry spells, El Niño
  'wildfire', // forest and grass fires (not building fires)
  'heat', // extreme heat
] as const;

// `(typeof NEWS_TYPES)[number]` means "any one item of that list".
export type NewsType = (typeof NEWS_TYPES)[number];

/** How many days headlines are kept (older ones are deleted by the news job). */
export const NEWS_KEEP_DAYS = 14;
