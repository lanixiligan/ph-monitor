// Job: fetch the next 48 hours of temperature and humidity at every weather
// point, from every heat map model in one request, and save the heat index.
// Display only: no scoring code reads heat_forecasts.
// Runs every 12 hours (due.ts); about 599 Open-Meteo calls a run.
// Run by hand with: npm run ingest:heatmap

import { HEAT_MODELS } from '@ph-monitor/shared';
// `import type` brings in a type only; it disappears when the code runs.
import type { HeatModelId } from '@ph-monitor/shared';
import { pool } from '../db.ts';
import { fetchOpenMeteoHeat } from '../fetchers/openMeteoHeat.ts';
import type { HeatLocation } from '../fetchers/openMeteoHeat.ts';
import { isFreshEnough } from '../freshness.ts';
import { heatIndexC } from '../heatIndex.ts';
import type { WeatherPoint } from './ingestWeather.ts';

/**
 * 50 points a request, 20 seconds apart: half the weather job's pace. When both
 * jobs run at once (every 12 hours) they stay near 450 calls a minute, under
 * Open-Meteo's 600, so the score's weather run is never refused. A run takes about 4 minutes.
 */
const GAP_BETWEEN_REQUESTS_MS = 20_000;

/** Forecast hours further in the past than this are deleted. */
const KEEP_PAST_HOURS = 6;

// `Promise<void>` = an async function that hands back nothing when it is done.
export async function ingestHeatMap(): Promise<void> {
  // `<WeatherPoint>` tells TypeScript what each row looks like.
  const points = await pool.query<WeatherPoint>(
    'SELECT id, ST_Y(geom) AS lat, ST_X(geom) AS lon FROM weather_points ORDER BY id',
  );
  if (points.rows.length === 0) {
    throw new Error('No weather points in the database. Run `npm run weather-points` first.');
  }
  const models = HEAT_MODELS.map((model) => model.id);
  const locations = await fetchOpenMeteoHeat(points.rows, models, { gapMs: GAP_BETWEEN_REQUESTS_MS });
  await saveHeatRun(points.rows, locations, models);
}

/** One model's rows, as lists ready for one INSERT (one entry per point and hour). */
type HeatRows = {
  pointIds: number[];
  validAts: Date[];
  temps: number[];
  humidities: number[];
  heatIndexes: number[];
  /** Points with at least one hour that has both values. */
  saved: number;
};

/** The hours to save for one model; hours with a missing value are skipped. */
function rowsFor(points: WeatherPoint[], locations: (HeatLocation | null)[], model: HeatModelId): HeatRows {
  const rows: HeatRows = { pointIds: [], validAts: [], temps: [], humidities: [], heatIndexes: [], saved: 0 };
  // `entries()` gives each point with its position.
  for (const [i, point] of points.entries()) {
    const location = locations[i];
    // `?.` reads a field only if the value is there.
    const hours = location?.models[model];
    if (!location || !hours) continue;
    let any = false;
    for (const [hour, validAt] of location.times.entries()) {
      const temp = hours.tempC[hour] ?? null;
      const humidity = hours.humidityPct[hour] ?? null;
      if (temp === null || humidity === null) continue;
      rows.pointIds.push(point.id);
      rows.validAts.push(validAt);
      rows.temps.push(temp);
      rows.humidities.push(humidity);
      rows.heatIndexes.push(heatIndexC(temp, humidity));
      any = true;
    }
    if (any) rows.saved += 1;
  }
  return rows;
}

/** Replaces one model's rows with this run's, in one transaction: never half old, half new. */
async function replaceModel(model: HeatModelId, rows: HeatRows, total: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM heat_forecasts WHERE model = $1', [model]);
    // `unnest` turns the lists into rows, one row per position.
    await client.query(
      `INSERT INTO heat_forecasts (model, point_id, valid_at, temp_c, humidity_pct, heat_index_c, fetched_at)
       SELECT $1, *, now() FROM unnest($2::int[], $3::timestamptz[], $4::real[], $5::real[], $6::real[])`,
      [model, rows.pointIds, rows.validAts, rows.temps, rows.humidities, rows.heatIndexes],
    );
    await client.query(
      `INSERT INTO heat_runs (model, last_ok_at, last_saved, last_total) VALUES ($1, now(), $2, $3)
       ON CONFLICT (model) DO UPDATE SET
         last_ok_at = EXCLUDED.last_ok_at,
         last_saved = EXCLUDED.last_saved,
         last_total = EXCLUDED.last_total`,
      [model, rows.saved, total],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Saves one run: `locations` has one entry per point, in the same order
 * (null = no usable answer). Split from ingestHeatMap so a test can call it
 * without the network. Each model is judged on its own: it replaces its rows
 * only when at least 90% of points have values; otherwise its last good run stays.
 */
export async function saveHeatRun(
  points: WeatherPoint[],
  locations: (HeatLocation | null)[],
  models: HeatModelId[],
): Promise<void> {
  const total = points.length;
  let goodModels = 0;
  // Points with at least one hour from any model (for fetch_runs).
  const answered = new Set<number>();

  for (const model of models) {
    const rows = rowsFor(points, locations, model);
    for (const id of rows.pointIds) answered.add(id);
    if (isFreshEnough(rows.saved, total)) {
      await replaceModel(model, rows, total);
      goodModels += 1;
      console.log(`Heat map: ${model} saved ${rows.saved} of ${total} points.`);
    } else {
      console.warn(`Heat map: ${model} had values for only ${rows.saved} of ${total} points; its last good run stays.`);
    }
  }

  await pool.query(`DELETE FROM heat_forecasts WHERE valid_at < now() - make_interval(hours => $1)`, [KEEP_PAST_HOURS]);

  if (answered.size === 0) {
    throw new Error('Open-Meteo heat: no point answered for any model; nothing saved.');
  }

  // The run counts as a success when at least one model was good. Otherwise
  // it records how much it saved but keeps the old "last success" time.
  if (goodModels > 0) {
    await pool.query(
      `INSERT INTO fetch_runs (source, last_ok_at, last_saved, last_total) VALUES ('open-meteo-heat', now(), $1, $2)
       ON CONFLICT (source) DO UPDATE SET
         last_ok_at = EXCLUDED.last_ok_at,
         last_saved = EXCLUDED.last_saved,
         last_total = EXCLUDED.last_total`,
      [answered.size, total],
    );
  } else {
    await pool.query(
      `UPDATE fetch_runs SET last_saved = $1, last_total = $2 WHERE source = 'open-meteo-heat'`,
      [answered.size, total],
    );
    console.warn('Heat map: no model reached 90% of points; not counted as a fresh run.');
  }
}
