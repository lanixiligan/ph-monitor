// Gathers the score inputs for every city and municipality ("town"):
// quakes and disaster events measured to the town's edge (0 if inside), and
// the worst weather of the points the town reads from. Used by computeScores.
// The rules (radius, reach, fading) are the same as for provinces.

import type { DisasterKind } from '@ph-monitor/shared';
import { OPEN_EVENT_FRESH_SQL } from '../conditions.ts';
import { pool } from '../db.ts';
import type { WeatherReading } from '../fetchers/openMeteo.ts';
import { heatIndexC } from '../heatIndex.ts';
import { radiusKm, WEIGHTS } from '../scoring/scoring.ts';
import type { EventInput, QuakeInput, WeatherInput } from '../scoring/scoring.ts';
import { worstByOwner } from '../weatherPoints.ts';
import type { PointLink } from '../weatherPoints.ts';

const HOUR_MS = 60 * 60 * 1000;

// A degree is at least ~100 km anywhere in the Philippines, so km / 100 in
// degrees is a box sure to hold everything within that many km. The map index
// uses the box to skip far-away towns before the exact distance is measured.
const KM_PER_DEGREE_AT_LEAST = 100;

export type TownInputs = {
  psgc: number;
  provincePsgc: number;
  quakes: QuakeInput[];
  /** null = no recent reading at any of its points (unknown, not calm). */
  weather: WeatherInput | null;
  events: EventInput[];
};

/** Every town with its inputs, in psgc order. Empty if the towns were never loaded. */
export async function readTownInputs(now: Date): Promise<TownInputs[]> {
  const places = await pool.query<{ psgc: number; province_psgc: number }>(
    'SELECT psgc, province_psgc FROM places ORDER BY psgc',
  );
  if (places.rows.length === 0) return [];

  // Recent quakes, one row per (quake, town in the largest possible radius).
  const quakeRows = await pool.query<{
    place_psgc: number;
    magnitude: number;
    depth_km: number | null;
    occurred_at: Date;
    distance_km: number;
  }>(
    `SELECT c.psgc AS place_psgc, q.magnitude, q.depth_km, q.occurred_at,
            ST_Distance(c.geom::geography, q.geom::geography) / 1000 AS distance_km
     FROM earthquakes q
     JOIN places c ON ST_DWithin(c.geom, q.geom, $3 / ${KM_PER_DEGREE_AT_LEAST}.0)
                  AND ST_DWithin(c.geom::geography, q.geom::geography, $3 * 1000)
     WHERE q.occurred_at >= $1 AND q.magnitude >= $2`,
    [
      new Date(now.getTime() - WEIGHTS.quake.windowHours * HOUR_MS),
      WEIGHTS.quake.minMagnitude,
      WEIGHTS.quake.radiusMaxKm,
    ],
  );

  // Disaster events with an alert level, one row per (event, town in the largest reach).
  const maxReachKm = Math.max(...Object.values(WEIGHTS.event.reachKm));
  const eventRows = await pool.query<{
    place_psgc: number;
    kind: DisasterKind; // checked when the event was saved
    alert_level: 'green' | 'orange' | 'red';
    ended_at: Date | null;
    distance_km: number;
  }>(
    `SELECT c.psgc AS place_psgc, e.kind, e.alert_level, e.ended_at,
            ST_Distance(c.geom::geography, e.geom::geography) / 1000 AS distance_km
     FROM events e
     JOIN places c ON ST_DWithin(c.geom, e.geom, $1 / ${KM_PER_DEGREE_AT_LEAST}.0)
                  AND ST_DWithin(c.geom::geography, e.geom::geography, $1 * 1000)
     WHERE e.alert_level IS NOT NULL AND e.kind = ANY($2::text[])
       AND (e.ended_at IS NULL OR e.ended_at >= $3)
       AND ${OPEN_EVENT_FRESH_SQL}`,
    [maxReachKm, WEIGHTS.event.kinds, new Date(now.getTime() - WEIGHTS.event.endedFadeHours * HOUR_MS)],
  );

  // The newest recent reading of each weather point, and which points each town uses.
  const pointRows = await pool.query<{
    point_id: number;
    valid_at: Date;
    temp_c: number | null;
    humidity_pct: number | null;
    rain_1h_mm: number | null;
    rain_24h_mm: number | null;
  }>(
    `SELECT DISTINCT ON (point_id) point_id, valid_at, temp_c, humidity_pct, rain_1h_mm, rain_24h_mm
     FROM point_readings
     WHERE valid_at >= $1
     ORDER BY point_id, valid_at DESC`,
    [new Date(now.getTime() - WEIGHTS.weather.maxAgeHours * HOUR_MS)],
  );
  const links = await pool.query<PointLink>(
    'SELECT place_psgc AS owner, point_id AS "pointId" FROM place_weather_points',
  );
  const readings = new Map<number, WeatherReading | null>();
  for (const row of pointRows.rows) {
    readings.set(row.point_id, {
      validAt: row.valid_at,
      tempC: row.temp_c,
      humidityPct: row.humidity_pct,
      rain1hMm: row.rain_1h_mm,
      rain24hMm: row.rain_24h_mm,
    });
  }
  const weatherByTown = worstByOwner(links.rows, readings);

  // Put it all together, one entry per town.
  const towns = new Map<number, TownInputs>();
  for (const place of places.rows) {
    const reading = weatherByTown.get(place.psgc);
    towns.set(place.psgc, {
      psgc: place.psgc,
      provincePsgc: place.province_psgc,
      quakes: [],
      weather: reading
        ? {
            heatIndexC:
              reading.tempC !== null && reading.humidityPct !== null
                ? heatIndexC(reading.tempC, reading.humidityPct)
                : null,
            rain1hMm: reading.rain1hMm,
            rain24hMm: reading.rain24hMm,
          }
        : null,
      events: [],
    });
  }
  for (const row of quakeRows.rows) {
    // The exact radius depends on the magnitude.
    if (row.distance_km > radiusKm(row.magnitude)) continue;
    towns.get(row.place_psgc)?.quakes.push({
      magnitude: row.magnitude,
      depthKm: row.depth_km,
      distanceKm: row.distance_km,
      hoursAgo: (now.getTime() - row.occurred_at.getTime()) / HOUR_MS,
    });
  }
  for (const row of eventRows.rows) {
    towns.get(row.place_psgc)?.events.push({
      kind: row.kind,
      alertLevel: row.alert_level,
      distanceKm: row.distance_km,
      hoursSinceEnd: row.ended_at ? (now.getTime() - row.ended_at.getTime()) / HOUR_MS : null,
    });
  }
  return [...towns.values()];
}
