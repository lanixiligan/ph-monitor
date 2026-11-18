// The historical replay's own logic: turns archived records into the inputs
// the score formulas expect "as of" a past hour. Pure functions, no database
// and no internet; the downloading is in scripts/replay.ts.
// The formulas and weights are NOT here: the replay calls scoring/scoring.ts.

import type { AlertLevel, DisasterKind } from '@ph-monitor/shared';
import { highestTown, WEIGHTS } from '../scoring/scoring.ts';
import type { AreaScore, EventInput, QuakeInput } from '../scoring/scoring.ts';

const HOUR_MS = 60 * 60 * 1000;

/** A score of this much or more is "High" (the same limit as web/src/scoreScale.ts). */
export const HIGH_FROM = 60;

/** One past earthquake as seen from one town (the distance is to the town's edge). */
export type TownQuake = {
  magnitude: number;
  depthKm: number | null;
  distanceKm: number;
  occurredAt: Date;
};

/** One past disaster event as seen from one town. */
export type TownEvent = {
  kind: DisasterKind;
  alertLevel: AlertLevel | null;
  startedAt: Date;
  endedAt: Date;
  /** Where it was over time, as a distance from the town, oldest first. A fixed event has one entry. */
  positions: { at: Date; distanceKm: number }[];
};

/** The quakes the score job would have counted at that hour. */
export function quakesAt(quakes: TownQuake[], at: Date): QuakeInput[] {
  const inputs: QuakeInput[] = [];
  for (const quake of quakes) {
    const hoursAgo = (at.getTime() - quake.occurredAt.getTime()) / HOUR_MS;
    if (hoursAgo < 0 || hoursAgo > WEIGHTS.quake.windowHours) continue;
    inputs.push({ magnitude: quake.magnitude, depthKm: quake.depthKm, distanceKm: quake.distanceKm, hoursAgo });
  }
  return inputs;
}

/** The events the score job would have counted at that hour, measured from where each one was then. */
export function eventsAt(events: TownEvent[], at: Date): EventInput[] {
  const inputs: EventInput[] = [];
  for (const event of events) {
    if (at.getTime() < event.startedAt.getTime()) continue;
    // The latest known position at or before this hour.
    let distanceKm: number | null = null;
    for (const position of event.positions) {
      if (position.at.getTime() <= at.getTime()) distanceKm = position.distanceKm;
    }
    if (distanceKm === null) continue;
    const hoursSinceEnd = (at.getTime() - event.endedAt.getTime()) / HOUR_MS;
    inputs.push({
      kind: event.kind,
      alertLevel: event.alertLevel,
      distanceKm,
      hoursSinceEnd: hoursSinceEnd > 0 ? hoursSinceEnd : null,
    });
  }
  return inputs;
}

export type TrackPoint = { at: Date; lat: number; lon: number };

/**
 * Reads one storm's positions from JMA's best-track file (the official record
 * of past storm paths). A storm starts with a header line ("66666", a number
 * whose first two digits are the year, ..., the name); each line after it is
 * one position: time as YYMMDDHH, then "002", the grade, and the latitude and
 * longitude in tenths of a degree.
 */
export function parseBestTrack(text: string, name: string, year: number): TrackPoint[] {
  const points: TrackPoint[] = [];
  let wanted = false;
  for (const line of text.split('\n')) {
    // Split on runs of spaces: "66666 1330  033" → ['66666', '1330', '033'].
    const parts = line.trim().split(/\s+/);
    if (parts[0] === '66666') {
      const twoDigits = Number(parts[1]?.slice(0, 2));
      // The file starts in 1951, so 51–99 are 19xx and the rest 20xx.
      const headerYear = twoDigits >= 51 ? 1900 + twoDigits : 2000 + twoDigits;
      wanted = headerYear === year && parts.includes(name.toUpperCase());
      continue;
    }
    if (!wanted) continue;
    const [time, , , lat, lon] = parts;
    if (!time || !/^\d{8}$/.test(time) || !lat || !lon) continue;
    const twoDigits = Number(time.slice(0, 2));
    const fullYear = twoDigits >= 51 ? 1900 + twoDigits : 2000 + twoDigits;
    points.push({
      // Date.UTC wants the month counted from 0, hence `- 1`.
      at: new Date(Date.UTC(fullYear, Number(time.slice(2, 4)) - 1, Number(time.slice(4, 6)), Number(time.slice(6, 8)))),
      lat: Number(lat) / 10,
      lon: Number(lon) / 10,
    });
  }
  return points;
}

/**
 * The time of the live weather job's last fetch at or before `at`, if it ran
 * every `everyMinutes`, starting at midnight UTC. The live score keeps using
 * that reading until the next fetch, so the replay does the same.
 */
export function weatherFetchAt(at: Date, everyMinutes: number): Date {
  const stepMs = everyMinutes * 60 * 1000;
  return new Date(Math.floor(at.getTime() / stepMs) * stepMs);
}

/**
 * One province's score at one past hour, with its parts. `weather` null = no
 * archived reading. `town` is the town whose score the province shows; the
 * rain amounts are that town's (null when its rain was too little to mention).
 */
export type ReplayStep = {
  at: Date;
  score: number;
  quake: number;
  weather: number | null;
  event: number;
  town: number | null;
  rain1hMm: number | null;
  rain24hMm: number | null;
};

/** A province's step from its towns' scores: its highest town, as on the live map. null = no towns. */
export function provinceStep(at: Date, towns: { psgc: number; area: AreaScore }[]): ReplayStep | null {
  const top = highestTown(towns);
  if (top === null) return null;
  const { score, quake, weather, event, reasons } = top.area;
  // The rain reason carries both amounts. Checking `key` tells TypeScript which kind of reason it is.
  const rain = reasons.find((reason) => reason.key === 'rain');
  return {
    at, score, quake, weather, event,
    town: top.psgc,
    rain1hMm: rain?.key === 'rain' ? rain.rain1hMm : null,
    rain24hMm: rain?.key === 'rain' ? rain.rain24hMm : null,
  };
}

export type ReplaySummary = {
  /** The hour with the highest score (the first one, if several tie). null when there were no steps. */
  peak: ReplayStep | null;
  /** The first hour at "High" or above; null = never. */
  firstHighAt: Date | null;
  /** Hours from the key time to the first "High": negative = before it. null = never. */
  hoursFromKey: number | null;
  /** How many hours were at "High" or above. */
  highHours: number;
};

/** Boils one province's hourly scores down to "did it reach High, and when?". */
export function summarize(steps: ReplayStep[], keyTime: Date): ReplaySummary {
  let peak: ReplayStep | null = null;
  let firstHighAt: Date | null = null;
  let highHours = 0;
  for (const step of steps) {
    if (peak === null || step.score > peak.score) peak = step;
    if (step.score >= HIGH_FROM) {
      highHours += 1;
      if (firstHighAt === null) firstHighAt = step.at;
    }
  }
  const hoursFromKey = firstHighAt === null ? null : (firstHighAt.getTime() - keyTime.getTime()) / HOUR_MS;
  return { peak, firstHighAt, hoursFromKey, highHours };
}
