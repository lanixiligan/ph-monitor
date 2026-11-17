// Job: work out every town's and every province's score from what is in the
// database. Run by hand with: npm run compute:scores
//
// A town (city or municipality) is scored from the quakes and events near it
// and the weather at its points. A province shows its highest town's score
// (see highestTown in scoring.ts); a province with no towns loaded is scored
// as a whole, from its own inputs.
//
// This file only gathers the inputs and saves the results.
// The formulas themselves are all in scoring/scoring.ts.

import type { DisasterKind } from '@ph-monitor/shared';
import { OPEN_EVENT_FRESH_SQL } from '../conditions.ts';
import { pool } from '../db.ts';
import { getFeedHealth, staleSignals } from '../freshness.ts';
import { needsHistoryRow } from '../scoreHistory.ts';
import type { HistoryEntry } from '../scoreHistory.ts';
import { highestTown, scoreArea, WEIGHTS } from '../scoring/scoring.ts';
// `import type` brings in types only; it disappears when the code runs.
import type { AreaScore, EventInput, QuakeInput, WeatherInput } from '../scoring/scoring.ts';
import { readTownInputs } from './townInputs.ts';

const HOUR_MS = 60 * 60 * 1000;

export async function computeScores(): Promise<void> {
  const now = new Date();

  // Signals whose feed has not answered lately. Their stored data may be
  // missing something new, so they count as "unknown", not as calm.
  const stale = staleSignals(await getFeedHealth(now));

  const provinces = await pool.query<{ psgc: number; name: string }>(
    'SELECT psgc, name FROM provinces ORDER BY psgc',
  );

  // Recent quakes, one row per (quake, affected province).
  const quakeRows = await pool.query<{
    province_psgc: number;
    magnitude: number;
    depth_km: number | null;
    distance_km: number;
    occurred_at: Date;
  }>(
    `SELECT l.province_psgc, q.magnitude, q.depth_km, l.distance_km, q.occurred_at
     FROM earthquake_provinces l
     JOIN earthquakes q ON q.id = l.earthquake_id
     WHERE q.occurred_at >= $1 AND q.magnitude >= $2`,
    [new Date(now.getTime() - WEIGHTS.quake.windowHours * HOUR_MS), WEIGHTS.quake.minMagnitude],
  );

  // The newest recent weather reading of each province.
  // DISTINCT ON keeps only the first row per province (the newest, given the ORDER BY).
  const weatherRows = await pool.query<{
    province_psgc: number;
    heat_index_c: number | null;
    rain_1h_mm: number | null;
    rain_24h_mm: number | null;
  }>(
    `SELECT DISTINCT ON (province_psgc) province_psgc, heat_index_c, rain_1h_mm, rain_24h_mm
     FROM weather_readings
     WHERE valid_at >= $1
     ORDER BY province_psgc, valid_at DESC`,
    [new Date(now.getTime() - WEIGHTS.weather.maxAgeHours * HOUR_MS)],
  );

  // Disaster events that have an alert level, one row per (event, province in
  // reach). The database narrows it down to the largest reach; the exact
  // reach depends on the alert level and is applied by the formula.
  const maxReachKm = Math.max(...Object.values(WEIGHTS.event.reachKm));
  const eventRows = await pool.query<{
    province_psgc: number;
    kind: DisasterKind; // checked when the event was saved
    alert_level: 'green' | 'orange' | 'red';
    distance_km: number;
    ended_at: Date | null;
  }>(
    `SELECT p.psgc AS province_psgc, e.kind, e.alert_level, e.ended_at,
            ST_Distance(p.geom::geography, e.geom::geography) / 1000 AS distance_km
     FROM events e
     JOIN provinces p ON ST_DWithin(p.geom::geography, e.geom::geography, $1)
     WHERE e.alert_level IS NOT NULL AND e.kind = ANY($2::text[])
       AND (e.ended_at IS NULL OR e.ended_at >= $3)
       AND ${OPEN_EVENT_FRESH_SQL}`,
    [maxReachKm * 1000, WEIGHTS.event.kinds, new Date(now.getTime() - WEIGHTS.event.endedFadeHours * HOUR_MS)],
  );

  // Group the rows by province. A Map is a lookup table: psgc → value.
  const quakesByProvince = new Map<number, QuakeInput[]>();
  for (const row of quakeRows.rows) {
    const list = quakesByProvince.get(row.province_psgc) ?? [];
    list.push({
      magnitude: row.magnitude,
      depthKm: row.depth_km,
      distanceKm: row.distance_km,
      hoursAgo: (now.getTime() - row.occurred_at.getTime()) / HOUR_MS,
    });
    quakesByProvince.set(row.province_psgc, list);
  }

  const weatherByProvince = new Map<number, WeatherInput>();
  for (const row of weatherRows.rows) {
    weatherByProvince.set(row.province_psgc, {
      heatIndexC: row.heat_index_c,
      rain1hMm: row.rain_1h_mm,
      rain24hMm: row.rain_24h_mm,
    });
  }

  const eventsByProvince = new Map<number, EventInput[]>();
  for (const row of eventRows.rows) {
    const list = eventsByProvince.get(row.province_psgc) ?? [];
    list.push({
      kind: row.kind,
      alertLevel: row.alert_level,
      distanceKm: row.distance_km,
      hoursSinceEnd: row.ended_at ? (now.getTime() - row.ended_at.getTime()) / HOUR_MS : null,
    });
    eventsByProvince.set(row.province_psgc, list);
  }

  // The newest history row of each province, to tell whether its score changed.
  const historyRows = await pool.query<{
    province_psgc: number;
    score: number;
    quake_score: number | null;
    weather_score: number | null;
    event_score: number | null;
    unknown_signals: string[] | null;
    computed_at: Date;
  }>(
    `SELECT DISTINCT ON (province_psgc)
            province_psgc, score, quake_score, weather_score, event_score, unknown_signals, computed_at
     FROM province_score_history
     ORDER BY province_psgc, computed_at DESC`,
  );
  const lastHistory = new Map<number, HistoryEntry>();
  for (const row of historyRows.rows) {
    lastHistory.set(row.province_psgc, {
      score: row.score,
      quakeScore: row.quake_score,
      weatherScore: row.weather_score,
      eventScore: row.event_score,
      unknownSignals: row.unknown_signals,
      computedAt: row.computed_at,
    });
  }

  // Every town's score, grouped by province: province psgc → its towns.
  const towns = await readTownInputs(now);
  const townsByProvince = new Map<number, { psgc: number; area: AreaScore }[]>();
  for (const town of towns) {
    const list = townsByProvince.get(town.provincePsgc) ?? [];
    list.push({ psgc: town.psgc, area: scoreArea(town.quakes, town.weather, town.events, stale) });
    townsByProvince.set(town.provincePsgc, list);
  }
  const townScores = [...townsByProvince.values()].flat();

  let highest = { name: '', score: -1 };
  let incomplete = 0;
  let historyAdded = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // The latest town scores: replaced as a whole, in one statement.
    // `unnest` turns the lists into rows, one row per position.
    await client.query('DELETE FROM place_scores');
    if (townScores.length > 0) {
      await client.query(
        `INSERT INTO place_scores
           (place_psgc, score, quake_score, weather_score, event_score, unknown_signals, reasons, computed_at)
         SELECT psgc, score, quake, weather, event, string_to_array(unknown, ','), reasons::jsonb, $8
         FROM unnest($1::bigint[], $2::int[], $3::int[], $4::int[], $5::int[], $6::text[], $7::text[])
           AS t(psgc, score, quake, weather, event, unknown, reasons)`,
        [
          townScores.map((town) => town.psgc),
          townScores.map((town) => town.area.score),
          townScores.map((town) => town.area.quake),
          townScores.map((town) => town.area.weather ?? 0),
          townScores.map((town) => town.area.event),
          // A list of lists can't go through unnest, so each list travels as "quake,weather".
          townScores.map((town) => town.area.unknown.join(',')),
          townScores.map((town) => JSON.stringify(town.area.reasons)),
          now,
        ],
      );
    }

    for (const province of provinces.rows) {
      // The highest town, or (no towns loaded) the province as a whole.
      const top = highestTown(townsByProvince.get(province.psgc) ?? []);
      const area =
        top?.area ??
        scoreArea(
          quakesByProvince.get(province.psgc) ?? [],
          weatherByProvince.get(province.psgc) ?? null,
          eventsByProvince.get(province.psgc) ?? [],
          stale,
        );
      const { score, quake, event: eventPoints, unknown, reasons } = area;
      const weatherPoints = area.weather;

      if (score > highest.score) highest = { name: province.name, score };
      if (unknown.length > 0) incomplete += 1;

      // The latest score: one row per province, replaced each time.
      await client.query(
        `INSERT INTO province_scores
           (province_psgc, score, quake_score, weather_score, reasons, computed_at, event_score, unknown_signals,
            top_place_psgc)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9)
         ON CONFLICT (province_psgc) DO UPDATE SET
           score = EXCLUDED.score,
           quake_score = EXCLUDED.quake_score,
           weather_score = EXCLUDED.weather_score,
           event_score = EXCLUDED.event_score,
           unknown_signals = EXCLUDED.unknown_signals,
           reasons = EXCLUDED.reasons,
           computed_at = EXCLUDED.computed_at,
           top_place_psgc = EXCLUDED.top_place_psgc`,
        [
          province.psgc, score, quake, weatherPoints ?? 0, JSON.stringify(reasons), now, eventPoints, unknown,
          top?.psgc ?? null,
        ],
      );

      // The history: a new row only when something changed (see scoreHistory.ts).
      const entry: HistoryEntry = {
        score,
        quakeScore: quake,
        weatherScore: weatherPoints ?? 0,
        eventScore: eventPoints,
        unknownSignals: unknown,
        computedAt: now,
      };
      if (needsHistoryRow(lastHistory.get(province.psgc) ?? null, entry)) {
        await client.query(
          `INSERT INTO province_score_history
             (province_psgc, score, computed_at, quake_score, weather_score, event_score, unknown_signals)
           VALUES ($1, $2, $3, $4, $5, $6, $7::text[])`,
          [province.psgc, score, now, quake, weatherPoints ?? 0, eventPoints, unknown],
        );
        historyAdded += 1;
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log(
    `Scores: ${provinces.rows.length} provinces, ${townScores.length} towns ` +
      `(${incomplete} provinces with missing data, ${historyAdded} changed and added to the history). ` +
      `Highest: ${highest.name} (${highest.score}).`,
  );
}
