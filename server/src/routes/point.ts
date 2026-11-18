// API route for one exact spot:
//   GET /api/point?lat=10.3157&lon=123.8854
// Works out a score for that point on demand: earthquake distances are
// measured from the point itself, and weather is fetched for the point.
// Nothing is saved; the formulas are the same ones in scoring/scoring.ts.

import { Router } from 'express';
import { z } from 'zod';
import type { DisasterKind, HazardEvent, PointDetail } from '@ph-monitor/shared';
import { getConditions, OPEN_EVENT_FRESH_SQL } from '../conditions.ts';
import { pool } from '../db.ts';
import { buildFreshness, getFeedHealth, getLastOk, staleSignals } from '../freshness.ts';
import { getPointWeather } from '../pointWeather.ts';
import {
  buildReasons,
  combineSignals,
  eventScore,
  hazardScores,
  quakeScore,
  radiusKm,
  weatherScore,
  WEIGHTS,
} from '../scoring/scoring.ts';
import type { EventInput, QuakeInput, WeatherInput } from '../scoring/scoring.ts';

export const pointRouter = Router();

const HOUR_MS = 60 * 60 * 1000;

// A click a little outside a province's edge (the map's shapes are slightly
// simplified) still counts as that province, up to this distance.
const EDGE_TOLERANCE_M = 2000;

// The numbers in the address are text; they must be inside a box around the Philippines.
const querySchema = z.object({
  lat: z.coerce.number().min(4).max(22),
  lon: z.coerce.number().min(116).max(128),
});

pointRouter.get('/', async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Give lat and lon as numbers inside the Philippines.' });
    return;
  }
  const { lat, lon } = parsed.data;
  const now = new Date();

  // Which province is the point in (or right next to)?
  // $1 and $2 are the longitude and latitude; ST_MakePoint wants them in that order.
  const provinceResult = await pool.query<{
    psgc: number;
    name: string;
    region_psgc: number;
    geo_level: 'Prov' | 'Dist' | 'Other';
    province_score: number | null;
  }>(
    `WITH spot AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS pt)
     SELECT p.psgc, p.name, p.region_psgc, p.geo_level, s.score AS province_score
     FROM spot, provinces p
     LEFT JOIN province_scores s ON s.province_psgc = p.psgc
     WHERE ST_DWithin(p.geom::geography, spot.pt::geography, $3)
     ORDER BY ST_Distance(p.geom, spot.pt)
     LIMIT 1`,
    [lon, lat, EDGE_TOLERANCE_M],
  );
  const province = provinceResult.rows[0];
  if (!province) {
    res.status(404).json({ error: 'That spot is not on land in the Philippines.' });
    return;
  }

  // Which city or municipality? (May be missing if places were never loaded.)
  const placeResult = await pool.query<{ psgc: number; name: string; geo_level: string }>(
    `WITH spot AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS pt)
     SELECT c.psgc, c.name, c.geo_level
     FROM spot, places c
     WHERE ST_DWithin(c.geom::geography, spot.pt::geography, $3)
     ORDER BY ST_Distance(c.geom, spot.pt)
     LIMIT 1`,
    [lon, lat, EDGE_TOLERANCE_M],
  );
  const place = placeResult.rows[0];

  // The whole town's score, as the map shows it (none before the first score run).
  const placeScoreResult = place
    ? await pool.query<{ score: number; unknown_signals: string[] }>(
        'SELECT score, unknown_signals FROM place_scores WHERE place_psgc = $1',
        [place.psgc],
      )
    : null;
  const placeScore = placeScoreResult?.rows[0];

  // Recent quakes near the point, with the distance from the point itself.
  // The database narrows it down to the largest possible radius; the exact
  // radius depends on each quake's magnitude and is checked just below.
  const quakeResult = await pool.query<{
    id: string;
    magnitude: number;
    depth_km: number | null;
    place: string | null;
    occurred_at: Date;
    url: string | null;
    distance_km: number;
  }>(
    `WITH spot AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS pt)
     SELECT q.id, q.magnitude, q.depth_km, q.place, q.occurred_at, q.url,
            ST_Distance(q.geom::geography, spot.pt::geography) / 1000 AS distance_km
     FROM spot, earthquakes q
     WHERE q.occurred_at >= $3 AND q.magnitude >= $4
       AND ST_DWithin(q.geom::geography, spot.pt::geography, $5)
     ORDER BY q.occurred_at DESC`,
    [
      lon,
      lat,
      new Date(now.getTime() - WEIGHTS.quake.windowHours * HOUR_MS),
      WEIGHTS.quake.minMagnitude,
      WEIGHTS.quake.radiusMaxKm * 1000,
    ],
  );
  const quakeRows = quakeResult.rows.filter((row) => row.distance_km <= radiusKm(row.magnitude));

  // Disaster events with an alert level near the point (distance from the point itself).
  const eventResult = await pool.query<{
    kind: DisasterKind; // checked when the event was saved
    alert_level: 'green' | 'orange' | 'red';
    ended_at: Date | null;
    distance_km: number;
  }>(
    `WITH spot AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS pt)
     SELECT e.kind, e.alert_level, e.ended_at,
            ST_Distance(e.geom::geography, spot.pt::geography) / 1000 AS distance_km
     FROM spot, events e
     WHERE e.alert_level IS NOT NULL AND e.kind = ANY($3::text[])
       AND (e.ended_at IS NULL OR e.ended_at >= $4)
       AND ${OPEN_EVENT_FRESH_SQL}
       AND ST_DWithin(e.geom::geography, spot.pt::geography, $5)`,
    [
      lon,
      lat,
      WEIGHTS.event.kinds,
      new Date(now.getTime() - WEIGHTS.event.endedFadeHours * HOUR_MS),
      Math.max(...Object.values(WEIGHTS.event.reachKm)) * 1000,
    ],
  );
  const eventInputs: EventInput[] = eventResult.rows.map((row) => ({
    kind: row.kind,
    alertLevel: row.alert_level,
    distanceKm: row.distance_km,
    hoursSinceEnd: row.ended_at ? (now.getTime() - row.ended_at.getTime()) / HOUR_MS : null,
  }));

  const pointWeather = await getPointWeather(lat, lon);

  // Score it with the same formulas as the provinces.
  const quakeInputs: QuakeInput[] = quakeRows.map((row) => ({
    magnitude: row.magnitude,
    depthKm: row.depth_km,
    distanceKm: row.distance_km,
    hoursAgo: (now.getTime() - row.occurred_at.getTime()) / HOUR_MS,
  }));
  const weatherInput: WeatherInput | null = pointWeather
    ? {
        heatIndexC: pointWeather.heatIndexC,
        rain1hMm: pointWeather.reading.rain1hMm,
        rain24hMm: pointWeather.reading.rain24hMm,
      }
    : null;

  const quake = quakeScore(quakeInputs);
  const weather = weatherScore(weatherInput);
  const eventPoints = eventScore(eventInputs);
  // A signal whose feed has not answered lately is "unknown", not calm.
  const stale = staleSignals(await getFeedHealth(now));
  const { score, unknown } = combineSignals({
    quake: stale.includes('quake') ? null : quake,
    weather,
    event: stale.includes('event') ? null : eventPoints,
  });

  const events: HazardEvent[] = quakeRows.map((row) => ({
    kind: 'earthquake',
    id: row.id,
    magnitude: row.magnitude,
    depthKm: row.depth_km,
    place: row.place,
    occurredAt: row.occurred_at.toISOString(),
    distanceKm: row.distance_km,
    url: row.url,
  }));
  if (pointWeather) {
    events.push({
      kind: 'weather',
      validAt: pointWeather.reading.validAt.toISOString(),
      tempC: pointWeather.reading.tempC,
      humidityPct: pointWeather.reading.humidityPct,
      heatIndexC: pointWeather.heatIndexC,
      rain1hMm: pointWeather.reading.rain1hMm,
      rain24hMm: pointWeather.reading.rain24hMm,
    });
  }

  const lastOk = await getLastOk();

  const detail: PointDetail = {
    lat,
    lon,
    place: place ? { psgc: place.psgc, name: place.name, geoLevel: place.geo_level } : null,
    province: {
      psgc: province.psgc,
      name: province.name,
      regionPsgc: province.region_psgc,
      geoLevel: province.geo_level,
    },
    placeScore: placeScore
      ? { score: placeScore.score, incomplete: placeScore.unknown_signals.length > 0 }
      : null,
    provinceScore: province.province_score,
    score: {
      score,
      quakeScore: quake,
      weatherScore: weather ?? 0,
      eventScore: eventPoints,
      hazards: hazardScores(quakeInputs, weatherInput, eventInputs),
      unknownSignals: unknown,
      reasons: buildReasons(quakeInputs, weatherInput, 'point', eventInputs, unknown),
      computedAt: now.toISOString(),
    },
    events,
    // Earthquakes come from the scheduled fetch; weather was fetched for this spot.
    freshness: buildFreshness(lastOk.earthquakes, pointWeather?.fetchedAt ?? null),
    conditions: await getConditions(province.psgc, { lat, lon }),
  };
  res.json(detail);
});
