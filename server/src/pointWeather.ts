// Weather for one exact spot, fetched from Open-Meteo only when someone asks
// for it (unlike province weather, which the scheduler fetches for everyone).
//
// To avoid asking Open-Meteo again and again for the same area, the spot is
// snapped to a grid and the answer is remembered for a while.

import { fetchOpenMeteo } from './fetchers/openMeteo.ts';
import type { WeatherReading } from './fetchers/openMeteo.ts';
import { heatIndexC } from './heatIndex.ts';

/** Grid size in degrees. 0.05° is about 5.5 km, finer than the weather model itself. */
const CELL_DEGREES = 0.05;
/** How long an answer is reused before asking again. */
const REUSE_MINUTES = 30;
/** The memory is emptied when it holds this many answers. */
const MAX_REMEMBERED = 500;

export type PointWeather = {
  reading: WeatherReading;
  heatIndexC: number | null;
  fetchedAt: Date;
};

// A Map is a lookup table: here, grid cell name → the answer for that cell.
const remembered = new Map<string, PointWeather>();

/** Snaps a coordinate to the centre of its grid cell, e.g. 10.3157 → 10.3. */
export function snapToCell(degrees: number): number {
  const snapped = Math.round(degrees / CELL_DEGREES) * CELL_DEGREES;
  // Rounding to 2 decimals removes tiny floating-point leftovers (10.299999…).
  return Math.round(snapped * 100) / 100;
}

/**
 * The latest weather near this spot, or null if Open-Meteo could not be
 * reached or its answer failed the checks.
 */
/**
 * A reader is waiting for the card, so a spot's weather gets 5 seconds per try
 * and no pause before the second try (about 10 seconds at worst). The weather
 * job keeps the patient defaults. If both tries fail, the card opens with the
 * weather marked unknown.
 */
export const POINT_FETCH = { pauseMs: 0, timeoutMs: 5_000 };

export async function getPointWeather(lat: number, lon: number): Promise<PointWeather | null> {
  const cell = { lat: snapToCell(lat), lon: snapToCell(lon) };
  const key = `${cell.lat},${cell.lon}`;

  const known = remembered.get(key);
  if (known && Date.now() - known.fetchedAt.getTime() < REUSE_MINUTES * 60 * 1000) {
    return known;
  }

  let reading: WeatherReading | null = null;
  try {
    const readings = await fetchOpenMeteo([cell], POINT_FETCH);
    reading = readings[0] ?? null;
  } catch (error) {
    console.error('Point weather: fetch failed:', error);
  }
  if (reading === null) return null;

  const answer: PointWeather = {
    reading,
    heatIndexC:
      reading.tempC !== null && reading.humidityPct !== null
        ? heatIndexC(reading.tempC, reading.humidityPct)
        : null,
    fetchedAt: new Date(),
  };

  if (remembered.size >= MAX_REMEMBERED) remembered.clear();
  remembered.set(key, answer);
  return answer;
}
