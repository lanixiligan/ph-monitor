// The rain forecast field for the Typhoon view: a fixed grid over the
// Philippine Area of Responsibility, and the 3-hour totals the map shows.
// Display only: the score never reads rain_forecasts.

// `import type` brings in a type only; it disappears when the code runs.
import type { RainForecastMap, RainFrame, RainGrid } from '@ph-monitor/shared';
import { pool } from './db.ts';
import { FEED_RULES } from './freshness.ts';
import { RAIN_MODEL } from './fetchers/openMeteoRain.ts';

/**
 * 1.5° apart (about 165 km), 16 × 16 = 256 points, from 114°E 4°N to 136.5°E
 * 26.5°N: the PAR (115–135°E, 5–25°N) and a small margin. Each run costs 256
 * Open-Meteo calls; a finer grid doesn't fit the day's 10,000 (see due.ts).
 */
export const RAIN_GRID: RainGrid = { west: 114, south: 4, step: 1.5, cols: 16, rows: 16 };

/** Hours in each map frame, like the 3-hour rainfall maps forecasters use. */
export const RAIN_STEP_HOURS = 3;

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Every grid point, row by row from the south (the same order as RainFrame.mm). */
export function gridPoints(grid: RainGrid): { index: number; lat: number; lon: number }[] {
  const points: { index: number; lat: number; lon: number }[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      points.push({ index: row * grid.cols + col, lat: grid.south + row * grid.step, lon: grid.west + col * grid.step });
    }
  }
  return points;
}

/** One saved point: the end time of its first hour, and its hourly rain (null = missing). */
export type SavedRainPoint = { index: number; startAt: Date; mm: (number | null)[] };

/**
 * The 3-hour frames from the period that holds `now` to the last full period.
 * Periods end on the UTC hours 0, 3, 6 … (Open-Meteo's longer-range steps line
 * up with them). A point's total is null when any of its 3 hours is missing.
 * Pure, so it can be tested without a database.
 */
export function buildFrames(points: SavedRainPoint[], cells: number, now: Date, stepHours = RAIN_STEP_HOURS): RainFrame[] {
  if (points.length === 0) return [];
  const stepMs = stepHours * HOUR_MS;
  // The end of the period that holds `now`: the next multiple of 3 hours (UTC).
  const firstEnd = Math.ceil(now.getTime() / stepMs) * stepMs;
  // The last hour any point has.
  const lastEnd = Math.max(...points.map((point) => point.startAt.getTime() + (point.mm.length - 1) * HOUR_MS));
  const frames: RainFrame[] = [];
  for (let end = firstEnd; end <= lastEnd; end += stepMs) {
    // `Array(n).fill(null)` = a list of n nulls; points without data stay null.
    const mm: (number | null)[] = Array(cells).fill(null);
    for (const point of points) {
      let total = 0;
      let complete = true;
      for (let back = stepHours - 1; back >= 0; back -= 1) {
        const hour = Math.round((end - back * HOUR_MS - point.startAt.getTime()) / HOUR_MS);
        const value = point.mm[hour] ?? null;
        if (value === null) {
          complete = false;
          break;
        }
        total += value;
      }
      // One decimal is plenty for a map; never a total for an incomplete period.
      if (complete) mm[point.index] = Math.round(total * 10) / 10;
    }
    frames.push({ endsAt: new Date(end).toISOString(), mm });
  }
  return frames;
}

/** The stale limit for this feed, from FEED_RULES. */
function staleAfterMinutes(): number {
  return FEED_RULES.find((rule) => rule.id === 'rainForecast')?.staleAfterMinutes ?? 25 * 60;
}

/** The answer for GET /api/rainforecast. */
export async function getRainForecast(now: Date = new Date()): Promise<RainForecastMap> {
  const rows = await pool.query<{ point_index: number; start_at: Date; hourly_mm: (number | null)[]; fetched_at: Date }>(
    'SELECT point_index, start_at, hourly_mm, fetched_at FROM rain_forecasts ORDER BY point_index',
  );
  const fetchedAt = rows.rows[0]?.fetched_at ?? null;
  const points = rows.rows.map((row) => ({ index: row.point_index, startAt: row.start_at, mm: row.hourly_mm }));
  return {
    model: RAIN_MODEL,
    stepHours: RAIN_STEP_HOURS,
    grid: RAIN_GRID,
    fetchedAt: fetchedAt === null ? null : fetchedAt.toISOString(),
    isStale: fetchedAt === null || now.getTime() - fetchedAt.getTime() > staleAfterMinutes() * MINUTE_MS,
    frames: buildFrames(points, RAIN_GRID.cols * RAIN_GRID.rows, now),
  };
}
