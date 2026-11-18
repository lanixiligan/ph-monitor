// THE scoring file: every weight and formula that turns raw events into the
// 0–100 score lives here, and nothing else does.
//
// All functions are "pure": same input, same output, no database, no clock.
// That makes them easy to test (see test/scoring.test.ts) and safe to tune.
// How it all fits together is explained in METHODOLOGY.md.

// `import type` brings in only the shapes of data; nothing is loaded when the code runs.
import type { AlertLevel, DisasterKind, ScoreReason, SignalName } from '@ph-monitor/shared';

/** Every number you might want to tune. These are starting guesses. */
export const WEIGHTS = {
  quake: {
    /** Smaller quakes are ignored. */
    minMagnitude: 4.0,
    /** Quakes older than this are ignored. A quake fades to 0 over this time. */
    windowHours: 72,
    /** A quake reaches provinces within radiusBaseKm × 2^(magnitude − 4)... */
    radiusBaseKm: 50,
    /** ...but never further than this. */
    radiusMaxKm: 400,
    /** Points for a quake of exactly minMagnitude (shallow, right here, just now). */
    scoreAtMinMagnitude: 25,
    /** This magnitude and above gets the full 100 points. */
    fullMagnitude: 7.0,
    /** Share of the points left at the very edge of the radius (1 = no fading). */
    edgeFade: 0.25,
    /** Down to this depth a quake counts in full. */
    shallowDepthKm: 20,
    /** From this depth on, a quake keeps only `deepDepthFade` of its points. */
    deepDepthKm: 300,
    deepDepthFade: 0.3,
    /** Points added for each extra quake that also scores at least 1... */
    extraQuakeBonus: 3,
    /** ...up to this many bonus points. */
    maxBonus: 10,
  },

  rain: {
    // Each step says "this much rain (mm) gives this score". Amounts between
    // two steps get a score in between. Based on PAGASA's rainfall warning
    // levels: 7.5 mm/hour = yellow, 15 = orange, 30 = red.
    oneHourSteps: [
      { at: 0, score: 0 },
      { at: 7.5, score: 40 },
      { at: 15, score: 60 },
      { at: 30, score: 85 },
      { at: 50, score: 100 },
    ],
    // Rain over 24 hours: 50 mm = heavy, 100 = intense, 200 = torrential.
    dayRainSteps: [
      { at: 0, score: 0 },
      { at: 50, score: 40 },
      { at: 100, score: 60 },
      { at: 200, score: 85 },
      { at: 300, score: 100 },
    ],
    /**
     * The "wet day" rule (Phase 6, chosen from the replay): a heavy hour below
     * `belowMm` (red) reaches "High" only if the last 24 hours had at least
     * `needsDayMm` (PAGASA's "heavy"); otherwise its score stops at `maxScore`,
     * just under "High". null = the rule is off. An unknown 24-hour amount
     * never counts as dry. See docs/replay-results.md for why 50 mm.
     */
    // `as number | null` tells TypeScript this may also hold null (rule off).
    oneHourCap: { needsDayMm: 50 as number | null, belowMm: 30, maxScore: 59 },
    /** Names sent with the reasons, strongest first. */
    oneHourLevels: [
      { from: 30, name: 'red' },
      { from: 15, name: 'orange' },
      { from: 7.5, name: 'yellow' },
    ],
  },

  heat: {
    // Heat index (°C) to score, following PAGASA's bands:
    // 27–32 caution, 33–41 extreme caution, 42–51 danger, 52+ extreme danger.
    steps: [
      { at: 27, score: 0 },
      { at: 33, score: 10 },
      { at: 42, score: 50 },
      { at: 52, score: 100 },
    ],
    /** Names sent with the reasons, strongest first. */
    bands: [
      { from: 52, name: 'extreme danger' },
      { from: 42, name: 'danger' },
      { from: 33, name: 'extreme caution' },
      { from: 27, name: 'caution' },
    ],
  },

  weather: {
    /**
     * A weather reading older than this is not used for scoring. Weather is
     * fetched every 2 hours, so one failed run still leaves a usable reading.
     */
    maxAgeHours: 4.5,
  },

  event: {
    // Disaster events with an alert level (GDACS: Green, Orange, Red).
    /** Points for an ongoing event right at the province, by alert level. */
    levelScore: { green: 10, orange: 50, red: 80 },
    /** How far an event of each level reaches, in km. */
    reachKm: { green: 100, orange: 200, red: 300 },
    /** Share of the points left at the very edge of the reach (1 = no fading). */
    edgeFade: 0.25,
    /** After an event ends, its points fall to 0 over this many hours. */
    endedFadeHours: 48,
    /**
     * The kinds of event that count. Earthquakes are left out because they
     * are already scored from USGS; droughts because they are slow and wide.
     */
    kinds: ['typhoon', 'flood', 'volcano', 'wildfire'],
  },

  /** When combining, each signal that is not the strongest adds this share of its score. */
  secondaryWeight: 0.25,

  /** Rain or heat is only mentioned in the reasons once it scores this much. */
  minScoreToMention: 5,
};

/** One earthquake as seen from one province. */
export type QuakeInput = {
  magnitude: number;
  /** null = the feed didn't say; treated as shallow. */
  depthKm: number | null;
  /** From the epicentre to the province's edge; 0 if inside. */
  distanceKm: number;
  hoursAgo: number;
};

/** The latest weather at a province's sample point. */
export type WeatherInput = {
  rain1hMm: number | null;
  rain24hMm: number | null;
  heatIndexC: number | null;
};

/** One disaster event as seen from one province or spot. */
export type EventInput = {
  /** 'typhoon', 'flood', 'volcano'... Only the kinds in WEIGHTS.event.kinds count. */
  kind: DisasterKind;
  /** null = the source gave no alert level; such an event does not score. */
  alertLevel: AlertLevel | null;
  /** From the event to the province's edge (or to the spot); 0 if inside. */
  distanceKm: number;
  /** null = still going on. */
  hoursSinceEnd: number | null;
};

type Step = { at: number; score: number };

/**
 * Reads a score off a list of steps, drawing a straight line between
 * neighbours. Below the first step → first score; above the last → last score.
 */
function scoreFromSteps(steps: Step[], value: number): number {
  let previous = steps[0];
  if (!previous || value <= previous.at) return previous?.score ?? 0;

  for (const step of steps) {
    if (value <= step.at) {
      const share = (value - previous.at) / (step.at - previous.at);
      return previous.score + share * (step.score - previous.score);
    }
    previous = step;
  }
  return previous.score;
}

// ---------- Earthquakes ----------

/**
 * How far a quake of this magnitude reaches, in km.
 * M4 → 50, M5 → 100, M6 → 200, M7 and above → 400.
 */
export function radiusKm(magnitude: number): number {
  const q = WEIGHTS.quake;
  const radius = q.radiusBaseKm * 2 ** (magnitude - 4);
  return Math.min(radius, q.radiusMaxKm);
}

/**
 * Points (0–100, not rounded) for one quake:
 * magnitude strength × distance fade × depth fade × time fade.
 */
export function singleQuakeScore(quake: QuakeInput): number {
  const q = WEIGHTS.quake;
  const radius = radiusKm(quake.magnitude);

  if (quake.magnitude < q.minMagnitude) return 0;
  if (quake.hoursAgo > q.windowHours) return 0;
  if (quake.distanceKm > radius) return 0;

  // Strength: a straight line from scoreAtMinMagnitude up to 100 at fullMagnitude.
  const strength = scoreFromSteps(
    [
      { at: q.minMagnitude, score: q.scoreAtMinMagnitude },
      { at: q.fullMagnitude, score: 100 },
    ],
    quake.magnitude,
  );

  // Distance: 1 at the epicentre, down to edgeFade at the edge of the radius.
  const distanceFade = 1 - (1 - q.edgeFade) * (quake.distanceKm / radius);

  // Depth: 1 for shallow quakes, down to deepDepthFade for very deep ones.
  const depthFade = scoreFromSteps(
    [
      { at: q.shallowDepthKm, score: 1 },
      { at: q.deepDepthKm, score: q.deepDepthFade },
    ],
    quake.depthKm ?? 0,
  );

  // Time: 1 right now, down to 0 at the end of the window.
  const timeFade = 1 - Math.max(0, quake.hoursAgo) / q.windowHours;

  return strength * distanceFade * depthFade * timeFade;
}

/** Earthquake score (0–100) for a province: its strongest quake plus a small bonus for more. */
export function quakeScore(quakes: QuakeInput[]): number {
  const q = WEIGHTS.quake;
  const scores = quakes.map(singleQuakeScore).filter((score) => score >= 1);
  if (scores.length === 0) return Math.round(Math.max(0, ...quakes.map(singleQuakeScore)));

  const strongest = Math.max(...scores);
  const bonus = Math.min(q.maxBonus, q.extraQuakeBonus * (scores.length - 1));
  return Math.min(100, Math.round(strongest + bonus));
}

// ---------- Weather ----------

/** Rain score (0–100): the worse of the 1-hour and 24-hour amounts. */
export function rainScore(weather: WeatherInput): number {
  let oneHour = scoreFromSteps(WEIGHTS.rain.oneHourSteps, weather.rain1hMm ?? 0);
  const day = scoreFromSteps(WEIGHTS.rain.dayRainSteps, weather.rain24hMm ?? 0);
  // The wet day rule, when it is on (see WEIGHTS.rain.oneHourCap).
  const cap = WEIGHTS.rain.oneHourCap;
  const dryDay = cap.needsDayMm !== null && weather.rain24hMm !== null && weather.rain24hMm < cap.needsDayMm;
  if (dryDay && (weather.rain1hMm ?? 0) < cap.belowMm) oneHour = Math.min(oneHour, cap.maxScore);
  return Math.round(Math.max(oneHour, day));
}

/** Heat score (0–100) from the heat index. */
export function heatScore(weather: WeatherInput): number {
  if (weather.heatIndexC === null) return 0;
  return Math.round(scoreFromSteps(WEIGHTS.heat.steps, weather.heatIndexC));
}

/**
 * Weather score (0–100): the higher of rain and heat.
 * Returns null ("unknown") when there is no recent reading, or the reading
 * has no values at all. Unknown is never the same as 0.
 */
export function weatherScore(weather: WeatherInput | null): number | null {
  if (weather === null) return null;
  const { rain1hMm, rain24hMm, heatIndexC } = weather;
  if (rain1hMm === null && rain24hMm === null && heatIndexC === null) return null;
  return Math.max(rainScore(weather), heatScore(weather));
}

// ---------- Disaster events ----------

/**
 * Points (0–100, not rounded) for one event:
 * alert level strength × distance fade × "has it ended?" fade.
 */
export function singleEventScore(event: EventInput): number {
  const e = WEIGHTS.event;
  if (event.alertLevel === null) return 0;
  if (!e.kinds.includes(event.kind)) return 0;

  const reach = e.reachKm[event.alertLevel];
  if (event.distanceKm > reach) return 0;

  // Distance: 1 at the event, down to edgeFade at the edge of its reach.
  const distanceFade = 1 - (1 - e.edgeFade) * (event.distanceKm / reach);

  // Ended: 1 while it is going on, down to 0 at endedFadeHours after the end.
  const hoursSinceEnd = Math.max(0, event.hoursSinceEnd ?? 0);
  if (hoursSinceEnd > e.endedFadeHours) return 0;
  const endedFade = 1 - hoursSinceEnd / e.endedFadeHours;

  return e.levelScore[event.alertLevel] * distanceFade * endedFade;
}

/** Event score (0–100) for a province: its strongest event. */
export function eventScore(events: EventInput[]): number {
  return Math.min(100, Math.round(Math.max(0, ...events.map(singleEventScore))));
}

// ---------- Combining ----------

/**
 * Overall score: the strongest signal counts in full, each other one adds a
 * share. (An average would hide a severe earthquake behind calm weather.)
 */
// `event = 0` is a default: callers that leave it out get 0.
export function totalScore(quake: number, weather: number, event = 0): number {
  // Sort a copy from strongest to weakest.
  const [strongest = 0, ...others] = [quake, weather, event].sort((a, b) => b - a);
  const extra = others.reduce((sum, score) => sum + WEIGHTS.secondaryWeight * score, 0);
  return Math.min(100, Math.round(strongest + extra));
}

/** One score per hazard, for the card. null = that part of the reading is missing. */
export type HazardScores = { quake: number; rain: number | null; heat: number | null; event: number };

/**
 * The same formulas as the overall score, shown hazard by hazard, so a hot
 * afternoon and a strong earthquake are never read as the same thing.
 */
export function hazardScores(
  quakes: QuakeInput[],
  weather: WeatherInput | null,
  events: EventInput[],
): HazardScores {
  const hasRain = weather !== null && (weather.rain1hMm !== null || weather.rain24hMm !== null);
  const hasHeat = weather !== null && weather.heatIndexC !== null;
  return {
    quake: quakeScore(quakes),
    rain: hasRain ? rainScore(weather) : null,
    heat: hasHeat ? heatScore(weather) : null,
    event: eventScore(events),
  };
}

/** The three signal scores; null = "we could not check this one". */
export type SignalScores = { quake: number | null; weather: number | null; event: number | null };

/**
 * Overall score when some signals may be unknown. The score is built from
 * the known signals only, so with anything in `unknown` it is a lower limit
 * ("at least N"), never a statement that all is calm.
 */
export function combineSignals(signals: SignalScores): { score: number; unknown: SignalName[] } {
  const names: SignalName[] = ['quake', 'weather', 'event'];
  const unknown = names.filter((name) => signals[name] === null);
  const score = totalScore(signals.quake ?? 0, signals.weather ?? 0, signals.event ?? 0);
  return { score, unknown };
}

// ---------- Reasons ----------

/** Finds the first name whose `from` the value reaches, e.g. 'orange'. */
function nameFor(levels: { from: number; name: string }[], value: number): string | null {
  for (const level of levels) {
    if (value >= level.from) return level.name;
  }
  return null;
}

/** What is being scored: a whole province, or one exact spot. */
export type ScoreTarget = 'province' | 'point';

function describeQuake(quake: QuakeInput, target: ScoreTarget): ScoreReason {
  return {
    key: 'quake',
    target,
    magnitude: quake.magnitude,
    distanceKm: Math.round(quake.distanceKm),
    isVeryClose: quake.distanceKm < 1,
    depthKm: quake.depthKm === null ? null : Math.round(quake.depthKm),
    hoursAgo: Math.round(quake.hoursAgo),
  };
}

// The caller only passes events that score, so the alert level is known.
function describeEvent(event: EventInput, level: AlertLevel, target: ScoreTarget): ScoreReason {
  return {
    key: 'event',
    target,
    alertLevel: level,
    kind: event.kind,
    distanceKm: Math.round(event.distanceKm),
    isVeryClose: event.distanceKm < 1,
    hasEnded: event.hoursSinceEnd !== null && event.hoursSinceEnd > 0,
  };
}

/**
 * Why the score is what it is, most important first. Each reason is a message
 * key plus numbers; the web app turns it into a sentence in the reader's language.
 */
// `target = 'province'`, `events = []` and `unknown = []` are defaults for callers that leave them out.
export function buildReasons(
  quakes: QuakeInput[],
  weather: WeatherInput | null,
  target: ScoreTarget = 'province',
  events: EventInput[] = [],
  /** Signals we could not check; each one is said out loud. */
  unknown: SignalName[] = [],
): ScoreReason[] {
  const reasons: ScoreReason[] = [];

  // Events that count, strongest first; describe up to three.
  const countedEvents = events
    .filter((event) => singleEventScore(event) >= 1)
    .sort((a, b) => singleEventScore(b) - singleEventScore(a));
  for (const event of countedEvents.slice(0, 3)) {
    if (event.alertLevel !== null) reasons.push(describeEvent(event, event.alertLevel, target));
  }

  // Quakes that count, strongest first; describe up to three.
  const counted = quakes
    .filter((quake) => singleQuakeScore(quake) >= 1)
    .sort((a, b) => singleQuakeScore(b) - singleQuakeScore(a));
  for (const quake of counted.slice(0, 3)) {
    reasons.push(describeQuake(quake, target));
  }
  if (counted.length > 3) {
    reasons.push({ key: 'moreQuakes', count: counted.length - 3 });
  }

  if (unknown.includes('quake')) reasons.push({ key: 'noQuakeData' });
  if (unknown.includes('event')) reasons.push({ key: 'noEventData' });

  if (weather === null || weatherScore(weather) === null) {
    reasons.push({ key: 'noWeather', target });
  } else {
    if (rainScore(weather) >= WEIGHTS.minScoreToMention) {
      reasons.push({
        key: 'rain',
        rain1hMm: weather.rain1hMm ?? 0,
        rain24hMm: weather.rain24hMm ?? 0,
        level: nameFor(WEIGHTS.rain.oneHourLevels, weather.rain1hMm ?? 0),
      });
    }
    if (heatScore(weather) >= WEIGHTS.minScoreToMention && weather.heatIndexC !== null) {
      reasons.push({
        key: 'heat',
        heatIndexC: weather.heatIndexC,
        band: nameFor(WEIGHTS.heat.bands, weather.heatIndexC),
      });
    }
  }

  if (reasons.length === 0) reasons.push({ key: 'calm' });
  return reasons;
}

// ---------- Areas: towns and provinces ----------

/** One area's finished score (a town, or a whole province). */
export type AreaScore = {
  score: number;
  quake: number;
  /** null = no usable weather reading. */
  weather: number | null;
  event: number;
  unknown: SignalName[];
  reasons: ScoreReason[];
  /** One score per hazard, for the status card's rows. */
  hazards: HazardScores;
};

/**
 * Scores one area from its inputs. `stale` lists the signals whose feed has
 * not answered lately: stored quakes and events still count (the score is
 * then "at least" this much), only the claim "nothing else" is dropped.
 */
export function scoreArea(
  quakes: QuakeInput[],
  weather: WeatherInput | null,
  events: EventInput[],
  stale: SignalName[],
): AreaScore {
  const quake = quakeScore(quakes);
  const weatherPoints = weatherScore(weather);
  const eventPoints = eventScore(events);
  const { score, unknown } = combineSignals({
    quake: stale.includes('quake') ? null : quake,
    weather: weatherPoints,
    event: stale.includes('event') ? null : eventPoints,
  });
  // Towns use the area wording ('province'): "inside", "in or beside".
  const reasons = buildReasons(quakes, weather, 'province', events, unknown);
  const hazards = hazardScores(quakes, weather, events);
  return { score, quake, weather: weatherPoints, event: eventPoints, unknown, reasons, hazards };
}

/**
 * The province rule: a province shows the score, parts and reasons of its
 * highest town, so the number on the map always belongs to a real town.
 * If any of its towns is missing a signal, the province is too ("at least").
 * Returns null when the province has no towns.
 */
export function highestTown(towns: { psgc: number; area: AreaScore }[]): { psgc: number; area: AreaScore } | null {
  let top: { psgc: number; area: AreaScore } | null = null;
  const unknown = new Set<SignalName>();
  for (const town of towns) {
    if (top === null || town.area.score > top.area.score) top = town;
    for (const name of town.area.unknown) unknown.add(name);
  }
  if (top === null) return null;
  // Keep the usual order: quake, weather, event.
  const names: SignalName[] = ['quake', 'weather', 'event'];
  return { psgc: top.psgc, area: { ...top.area, unknown: names.filter((name) => unknown.has(name)) } };
}
