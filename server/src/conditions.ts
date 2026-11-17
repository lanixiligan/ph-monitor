// "What is happening around here?" beyond the score: the 7-day outlook,
// nearby disaster events, storms forecast to pass close, and recent headlines.
// Shared by the province and point routes, and by routes/conditions.ts.
// None of this changes the score.

import type {
  AlertLevel,
  Conditions,
  DisasterEvent,
  DisasterKind,
  ForecastDay,
  NewsItem,
  NewsOutletLink,
  OfficialAlert,
  OutletCategory,
  StormComing,
} from '@ph-monitor/shared';
import { pool } from './db.ts';
import { isAlertInEffect } from './fetchers/pagasa.ts';

/** An event is listed on the card when it is within this distance. */
export const NEAR_EVENT_KM = 300;
/** A storm is "coming" when its forecast centre passes within this distance. */
export const STORM_NEAR_KM = 300;
/** A storm's latest known position still counts as "now" for this long. */
const STORM_NOW_HOURS = 12;
/** Events that ended longer ago than this are no longer shown. */
export const EVENT_SHOWN_DAYS = 7;
/** Headlines older than this are not shown on the card. */
const NEWS_NEAR_DAYS = 3;
const NEWS_NEAR_LIMIT = 5;

// A wide box around the Philippines (5 degrees past the land on each side):
// west, south, east, north. Events outside it are not shown.
const SHOWN_BOX = [111, -0.5, 132, 26.5];

/**
 * An event with no end date is only believed while its feed keeps listing
 * it. If it was not refreshed for this long, it is ignored everywhere.
 */
export const OPEN_EVENT_MAX_HOURS = 24;

/** The WHERE rule for "if still open, it was refreshed lately". `e` is the events table. */
export const OPEN_EVENT_FRESH_SQL = `
  (e.ended_at IS NOT NULL OR e.fetched_at >= now() - interval '${OPEN_EVENT_MAX_HOURS} hours')`;

/** The WHERE rule for "an event worth showing now". `e` is the events table. */
export const CURRENT_EVENT_SQL = `
  (e.ended_at IS NULL OR e.ended_at >= now() - interval '${EVENT_SHOWN_DAYS} days')
  AND ${OPEN_EVENT_FRESH_SQL}
  AND ST_Intersects(e.geom, ST_MakeEnvelope(${SHOWN_BOX.join(', ')}, 4326))`;

/** The columns every event query reads. ST_PointOnSurface picks one point inside an area. */
export const EVENT_COLUMNS = `
  e.id, e.source, e.kind, e.alert_level, e.title, e.started_at, e.ended_at, e.url,
  ST_Y(ST_PointOnSurface(e.geom)) AS lat, ST_X(ST_PointOnSurface(e.geom)) AS lon`;

export type EventRow = {
  id: string;
  source: 'gdacs' | 'eonet';
  kind: DisasterKind;
  alert_level: AlertLevel | null;
  title: string;
  started_at: Date;
  ended_at: Date | null;
  url: string | null;
  lat: number;
  lon: number;
  // `?` means the column is only there in some queries.
  distance_km?: number;
};

export function toDisasterEvent(row: EventRow): DisasterEvent {
  const event: DisasterEvent = {
    id: row.id,
    source: row.source,
    kind: row.kind,
    alertLevel: row.alert_level,
    title: row.title,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at?.toISOString() ?? null,
    url: row.url,
    lat: row.lat,
    lon: row.lon,
  };
  if (row.distance_km !== undefined) event.distanceKm = Math.round(row.distance_km);
  return event;
}

export type NewsRow = {
  id: string; // BIGSERIAL comes back from `pg` as text
  title: string;
  url: string;
  outlet: string;
  category: OutletCategory;
  published_at: Date;
  province_psgcs: string[]; // BIGINT[] comes back as a list of text
  other_outlets: NewsOutletLink[];
};

export const NEWS_COLUMNS =
  'id, title, url, outlet, category, published_at, province_psgcs, other_outlets';

export function toNewsItem(row: NewsRow): NewsItem {
  return {
    id: Number(row.id),
    title: row.title,
    url: row.url,
    outlet: row.outlet,
    category: row.category,
    publishedAt: row.published_at.toISOString(),
    provincePsgcs: row.province_psgcs.map(Number),
    otherOutlets: row.other_outlets,
  };
}

/**
 * Everything for one status card.
 * `spot` = the clicked point; null = measure from the whole province's shape.
 */
export async function getConditions(
  psgc: number,
  spot: { lat: number; lon: number } | null,
): Promise<Conditions> {
  // The place we measure distances from, as SQL, with the values it needs.
  const target = spot
    ? 'ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography'
    : '(SELECT geom FROM provinces WHERE psgc = $1)::geography';
  const targetValues = spot ? [spot.lon, spot.lat] : [psgc];
  // The next free $ number after the target's own values.
  const next = targetValues.length + 1;

  const outlook = await pool.query<{
    day: string;
    rain_mm: number | null;
    gust_kmh: number | null;
    river_discharge_m3s: number | null;
  }>(
    // to_char keeps the day as plain text such as "2026-11-17".
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, rain_mm, gust_kmh, river_discharge_m3s
     FROM forecast_days
     WHERE province_psgc = $1 AND day >= (now() AT TIME ZONE 'Asia/Manila')::date
     ORDER BY day LIMIT 7`,
    [psgc],
  );

  const events = await pool.query<EventRow>(
    `SELECT ${EVENT_COLUMNS},
            ST_Distance(e.geom::geography, ${target}) / 1000 AS distance_km
     FROM events e
     WHERE ${CURRENT_EVENT_SQL}
       AND ST_DWithin(e.geom::geography, ${target}, $${next})
     ORDER BY distance_km`,
    [...targetValues, NEAR_EVENT_KM * 1000],
  );

  // For each active storm, how close its path comes. The path is a line from
  // where the storm is now through its forecast positions, cut into pieces
  // (one per pair of neighbouring positions). Measuring to the line, not to
  // the positions, catches a storm that passes between two of them, or one
  // that is overhead right now.
  // LEAD(...) reads the next row's value; DISTINCT ON keeps the closest piece per storm.
  // ST_LineLocatePoint says how far along the piece (0 to 1) the closest spot is,
  // which gives the time by reading between the two positions' times.
  const storms = await pool.query<{
    id: string;
    name: string;
    closest_at: Date;
    distance_km: number;
  }>(
    `WITH positions AS (
       SELECT t.storm_id, t.valid_at, t.geom
       FROM storm_track_points t
       JOIN storms s ON s.id = t.storm_id
       WHERE s.is_active
         AND (t.is_forecast OR t.valid_at = (
           SELECT max(o.valid_at) FROM storm_track_points o
           WHERE o.storm_id = t.storm_id AND NOT o.is_forecast))
     ),
     pieces AS (
       SELECT storm_id, valid_at AS from_at,
              COALESCE(LEAD(valid_at) OVER w, valid_at) AS to_at,
              ST_MakeLine(geom, COALESCE(LEAD(geom) OVER w, geom)) AS line
       FROM positions
       WINDOW w AS (PARTITION BY storm_id ORDER BY valid_at)
     )
     SELECT DISTINCT ON (s.id) s.id, s.name,
            ST_Distance(p.line::geography, ${target}) / 1000 AS distance_km,
            p.from_at + (p.to_at - p.from_at) *
              ST_LineLocatePoint(p.line, ST_ClosestPoint(p.line, (${target})::geometry)) AS closest_at
     FROM pieces p
     JOIN storms s ON s.id = p.storm_id
     WHERE p.to_at >= now() - interval '${STORM_NOW_HOURS} hours'
       AND ST_DWithin(p.line::geography, ${target}, $${next})
     ORDER BY s.id, distance_km`,
    [...targetValues, STORM_NEAR_KM * 1000],
  );

  const news = await pool.query<NewsRow>(
    // `$1 = ANY(list)` means "the list contains $1".
    `SELECT ${NEWS_COLUMNS} FROM news
     WHERE $1 = ANY(province_psgcs) AND published_at >= now() - interval '${NEWS_NEAR_DAYS} days'
     ORDER BY published_at DESC LIMIT ${NEWS_NEAR_LIMIT}`,
    [psgc],
  );

  const outlookDays: ForecastDay[] = outlook.rows.map((row) => ({
    day: row.day,
    rainMm: row.rain_mm,
    gustKmh: row.gust_kmh,
    riverDischargeM3s: row.river_discharge_m3s,
  }));
  const stormsComing: StormComing[] = storms.rows.map((row) => ({
    stormId: row.id,
    name: row.name,
    closestAt: row.closest_at.toISOString(),
    distanceKm: Math.round(row.distance_km),
  }));

  return {
    outlook: outlookDays,
    nearbyEvents: events.rows.map(toDisasterEvent),
    stormsComing,
    news: news.rows.map(toNewsItem),
    officialAlerts: await getOfficialAlerts(psgc),
  };
}

type AlertRow = {
  id: string;
  agency: string;
  event: string;
  headline: string;
  severity: string;
  description: string;
  instruction: string | null;
  web: string | null;
  url: string;
  sent_at: Date;
  expires_at: Date;
  is_all_clear: boolean;
  is_replaced: boolean;
  area_names: string[];
  province_psgcs: string[]; // BIGINT[] comes back as a list of text
  is_nationwide: boolean;
};

/**
 * Official alerts in effect, newest first. With a province code: the ones
 * that name it, plus the country-wide ones. null = all of them.
 */
export async function getOfficialAlerts(psgc: number | null): Promise<OfficialAlert[]> {
  const result = await pool.query<AlertRow>(
    `SELECT id, agency, event, headline, severity, description, instruction, web, url, sent_at,
            expires_at, is_all_clear, is_replaced, area_names, province_psgcs, is_nationwide
     FROM official_alerts
     WHERE expires_at > now()
       AND ($1::bigint IS NULL OR is_nationwide OR $1 = ANY(province_psgcs))
     ORDER BY sent_at DESC`,
    [psgc],
  );
  const now = new Date();
  return result.rows
    .filter((row) =>
      isAlertInEffect({ expiresAt: row.expires_at, isAllClear: row.is_all_clear, isReplaced: row.is_replaced }, now),
    )
    .map((row) => ({
      id: row.id,
      agency: row.agency,
      event: row.event,
      headline: row.headline,
      severity: row.severity,
      description: row.description,
      instruction: row.instruction,
      web: row.web,
      url: row.url,
      sentAt: row.sent_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      areaNames: row.area_names,
      provincePsgcs: row.province_psgcs.map(Number),
      isNationwide: row.is_nationwide,
    }));
}
