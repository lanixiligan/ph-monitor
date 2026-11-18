// Historical replay: feeds the score formulas with archived data from known
// disasters and from one ordinary week, and prints "did the affected
// provinces reach High, and when?". Run with: npm run replay
//
// It changes nothing: it only reads the map (provinces, towns, weather points)
// from the database and never saves a score. The weights are not touched.
//
// It scores the way the live app does: every town in the affected provinces
// gets its own score (quakes and events measured to its edge, the worst
// weather of the grid points it reads from), and a province shows its
// highest town. Needs `npm run load-places` and `npm run weather-points` first.
//
// Archives used (downloaded once into data/replay/, then reused):
//   USGS            past earthquakes (the same service as the live feed)
//   Open-Meteo      archived hourly weather (ERA5 reanalysis, not the live forecast model)
//   GDACS           past disaster events with their final alert level
//   JMA best track  where each past typhoon was, every 6 hours
//
// How it differs from the live app (read the results with this in mind):
//   - Rain comes from a coarser archive model, which smooths out typhoon rain.
//   - A GDACS event has its FINAL alert level from its first hour.
//   - Every feed is treated as working (nothing is "unknown").
//   - Scores are worked out once an hour, on the hour; the weather is "fetched"
//     on the live job's schedule (every 2 hours, from midnight UTC).
//
// To try another "wet day" amount for heavy hours (WEIGHTS.rain.oneHourCap),
// or the rule turned off, for one run: WET_DAY_MM=100 npm run replay
//                                      WET_DAY_MM=off npm run replay

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../src/db.ts';
import { parseGdacsApi } from '../src/fetchers/gdacs.ts';
import { parseOpenMeteoLocation } from '../src/fetchers/openMeteo.ts';
import type { WeatherReading } from '../src/fetchers/openMeteo.ts';
import { parseUsgsFeed, QUAKE_BOX } from '../src/fetchers/usgs.ts';
import { heatIndexC } from '../src/heatIndex.ts';
import { JOB_RULES } from '../src/jobs/due.ts';
import {
  eventsAt, HIGH_FROM, parseBestTrack, provinceStep, quakesAt, summarize, weatherFetchAt,
} from '../src/replay/replay.ts';
import type { ReplayStep, TownEvent, TownQuake } from '../src/replay/replay.ts';
import { radiusKm, rainScore, scoreArea, WEIGHTS } from '../src/scoring/scoring.ts';
import type { AreaScore, WeatherInput } from '../src/scoring/scoring.ts';
import { worstByOwner } from '../src/weatherPoints.ts';
import type { PointLink } from '../src/weatherPoints.ts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** How often the live weather job fetches, in minutes (2 hours). */
const WEATHER_EVERY_MINUTES = JOB_RULES.find((rule) => rule.job === 'weather')?.everyMinutes ?? 60;
// Open-Meteo allows 600 calls a minute and counts each point as one call. A
// request carries 50 points, so waiting 6 seconds after each stays near 500 a minute.
const WEATHER_POINTS_PER_REQUEST = 50;
const WEATHER_PAUSE_MS = 6000;
// The same box trick as jobs/townInputs.ts: a degree is at least ~100 km here,
// so km / 100 in degrees is a box sure to hold everything within that many km.
const KM_PER_DEGREE_AT_LEAST = 100;
const cacheDir = path.resolve(import.meta.dirname, '../../data/replay');

type ReplayCase = {
  id: string;
  title: string;
  /** The moment the provinces should be at "High" by; null for the ordinary week. */
  keyTime: Date | null;
  keyLabel: string;
  start: Date;
  end: Date;
  /** Province names as in the database, or 'all'. */
  provinces: string[] | 'all';
};

const CASES: ReplayCase[] = [
  {
    id: 'yolanda-2013',
    title: 'Typhoon Yolanda (Haiyan), November 2013',
    keyTime: new Date('2013-11-07T20:40:00Z'),
    keyLabel: 'first landfall, Guiuan, Eastern Samar (Nov 8, 4:40 am)',
    start: new Date('2013-11-05T00:00:00Z'),
    end: new Date('2013-11-10T00:00:00Z'),
    provinces: ['Eastern Samar', 'Samar', 'Leyte', 'Cebu', 'Capiz', 'Iloilo'],
  },
  {
    id: 'taal-2020',
    title: 'Taal Volcano eruption, January 2020',
    keyTime: new Date('2020-01-12T05:00:00Z'),
    keyLabel: 'eruption begins (Jan 12, about 1 pm)',
    start: new Date('2020-01-10T00:00:00Z'),
    end: new Date('2020-01-16T00:00:00Z'),
    provinces: ['Batangas', 'Cavite', 'Laguna'],
  },
  {
    id: 'odette-2021',
    title: 'Typhoon Odette (Rai), December 2021',
    keyTime: new Date('2021-12-16T05:30:00Z'),
    keyLabel: 'first landfall, Siargao, Surigao del Norte (Dec 16, 1:30 pm)',
    start: new Date('2021-12-14T00:00:00Z'),
    end: new Date('2021-12-19T00:00:00Z'),
    provinces: ['Surigao del Norte', 'Dinagat Islands', 'Southern Leyte', 'Bohol', 'Cebu', 'Negros Oriental'],
  },
  {
    id: 'abra-2022',
    title: 'Abra earthquake, magnitude 7.0, July 2022',
    keyTime: new Date('2022-07-27T00:43:00Z'),
    keyLabel: 'the earthquake (Jul 27, 8:43 am)',
    start: new Date('2022-07-25T00:00:00Z'),
    end: new Date('2022-07-30T00:00:00Z'),
    provinces: ['Abra', 'Ilocos Sur', 'Mountain Province', 'Benguet'],
  },
  {
    // Picked as a week with no typhoon and no damaging earthquake. Change the
    // dates to try another week.
    id: 'ordinary-week-2023',
    title: 'An ordinary week, 6 to 12 February 2023 (all provinces)',
    keyTime: null,
    keyLabel: '',
    start: new Date('2023-02-06T00:00:00Z'),
    end: new Date('2023-02-13T00:00:00Z'),
    provinces: 'all',
  },
];

type Province = { psgc: number; name: string };
type Town = { psgc: number; name: string; provincePsgc: number };
type WeatherPoint = { id: number; lat: number; lon: number };
/** The map as the live app sees it, read once from the database. */
type MapData = { provinces: Province[]; towns: Town[]; points: WeatherPoint[]; links: PointLink[] };

// ---------- Downloading (each file once) ----------

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Downloads a JSON file, or reads the copy kept from an earlier run. Waits `pauseMs` after a download. */
async function cachedJson(name: string, url: string, pauseMs = 1500): Promise<unknown> {
  const file = path.join(cacheDir, `${name}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status} from ${new URL(url).host}`);
  // An empty answer (GDACS sends one when nothing matches) is kept as "no events".
  const text = (await response.text()) || '{"features":[]}';
  await writeFile(file, text);
  // Be gentle with the archives: wait between downloads.
  await pause(pauseMs);
  return JSON.parse(text);
}

let bestTrackText: string | null = null;

/** JMA's best-track file (one zip of about 750 KB with every storm since 1951). */
async function bestTrackFile(): Promise<string> {
  if (bestTrackText !== null) return bestTrackText;
  const file = path.join(cacheDir, 'bst_all.zip');
  if (!existsSync(file)) {
    const url = 'https://www.jma.go.jp/jma/jma-eng/jma-center/rsmc-hp-pub-eg/Besttracks/bst_all.zip';
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`JMA best track: HTTP ${response.status}`);
    // A zip is not text, so it is saved as raw bytes (a Buffer).
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
  // `unzip -p` prints the file inside the zip. Needs the `unzip` program.
  bestTrackText = execFileSync('unzip', ['-p', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return bestTrackText;
}

const day = (date: Date) => date.toISOString().slice(0, 10);

// ---------- Distances, measured by the database ----------

/**
 * Distance in km from each town's edge (0 if inside) to each position, for
 * positions within `maxKm` of the town; the rest are Infinity (out of reach).
 * Answer: town psgc → one distance per position.
 */
async function townDistancesKm(
  towns: Town[],
  positions: { lat: number; lon: number }[],
  maxKm: number,
): Promise<Map<number, number[]>> {
  const answer = new Map<number, number[]>(towns.map((town) => [town.psgc, positions.map(() => Infinity)]));
  if (positions.length === 0) return answer;
  // unnest turns the two lists into rows; WITH ORDINALITY numbers them 1, 2, 3...
  // The first ST_DWithin (a cheap box) skips far-away towns, the second is exact.
  const result = await pool.query<{ psgc: number; n: number; km: number }>(
    `WITH i AS (
       SELECT n, ST_SetSRID(ST_MakePoint(lon, lat), 4326) AS geom
       FROM unnest($1::float8[], $2::float8[]) WITH ORDINALITY AS u(lon, lat, n)
     )
     SELECT c.psgc, i.n, ST_Distance(c.geom::geography, i.geom::geography) / 1000 AS km
     FROM i
     JOIN places c ON c.psgc = ANY($3::bigint[])
                  AND ST_DWithin(c.geom, i.geom, $4 / ${KM_PER_DEGREE_AT_LEAST}.0)
                  AND ST_DWithin(c.geom::geography, i.geom::geography, $4 * 1000)`,
    [positions.map((p) => p.lon), positions.map((p) => p.lat), towns.map((town) => town.psgc), maxKm],
  );
  for (const row of result.rows) {
    const list = answer.get(row.psgc);
    if (list) list[row.n - 1] = row.km;
  }
  return answer;
}

// ---------- Gathering one case's archived data ----------

async function loadQuakes(replay: ReplayCase, towns: Town[]): Promise<Map<number, TownQuake[]>> {
  const params = new URLSearchParams({
    format: 'geojson',
    eventtype: 'earthquake',
    // Quakes count for 72 hours, so start that much earlier.
    starttime: new Date(replay.start.getTime() - WEIGHTS.quake.windowHours * HOUR_MS).toISOString(),
    endtime: replay.end.toISOString(),
    minmagnitude: String(WEIGHTS.quake.minMagnitude),
    minlatitude: String(QUAKE_BOX.minLat),
    maxlatitude: String(QUAKE_BOX.maxLat),
    minlongitude: String(QUAKE_BOX.minLon),
    maxlongitude: String(QUAKE_BOX.maxLon),
  });
  const json = await cachedJson(`${replay.id}-usgs`, `https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`);
  const { quakes } = parseUsgsFeed(json);
  const distances = await townDistancesKm(towns, quakes, WEIGHTS.quake.radiusMaxKm);

  const byTown = new Map<number, TownQuake[]>();
  for (const town of towns) {
    const list: TownQuake[] = [];
    quakes.forEach((quake, i) => {
      const distanceKm = distances.get(town.psgc)?.[i];
      // The same reach rule as the earthquake job.
      if (distanceKm === undefined || distanceKm > radiusKm(quake.magnitude)) return;
      list.push({ magnitude: quake.magnitude, depthKm: quake.depthKm, distanceKm, occurredAt: quake.occurredAt });
    });
    byTown.set(town.psgc, list);
  }
  return byTown;
}

async function loadEvents(replay: ReplayCase, towns: Town[]): Promise<Map<number, TownEvent[]>> {
  // Events that started up to 10 days before the window may still be going.
  const params = new URLSearchParams({
    country: 'Philippines',
    fromDate: day(new Date(replay.start.getTime() - 10 * DAY_MS)),
    toDate: day(replay.end),
  });
  const json = await cachedJson(
    `${replay.id}-gdacs`,
    `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?${params}`,
  );
  const { events } = parseGdacsApi(json);
  const maxReachKm = Math.max(...Object.values(WEIGHTS.event.reachKm));

  const byTown = new Map<number, TownEvent[]>(towns.map((town) => [town.psgc, []]));
  for (const event of events) {
    if (event.alertLevel === null || !WEIGHTS.event.kinds.includes(event.kind)) continue;
    const [lon = 0, lat = 0] = event.geometry.type === 'Point' ? event.geometry.coordinates : [];

    // GDACS keeps only a typhoon's LAST position, so its path comes from JMA.
    let track = [{ at: event.startedAt, lat, lon }];
    if (event.kind === 'typhoon') {
      // "Tropical Cyclone HAIYAN-13" → HAIYAN
      const name = /([A-Z][A-Z-]*)-\d\d$/.exec(event.title.trim())?.[1] ?? '';
      const jmaTrack = parseBestTrack(await bestTrackFile(), name, event.startedAt.getUTCFullYear());
      if (jmaTrack.length > 0) track = jmaTrack;
      else console.warn(`  (no JMA track found for "${event.title}"; using GDACS's single position)`);
    }

    const distances = await townDistancesKm(towns, track, maxReachKm);
    for (const town of towns) {
      const list = distances.get(town.psgc) ?? [];
      byTown.get(town.psgc)?.push({
        kind: event.kind,
        alertLevel: event.alertLevel,
        startedAt: event.startedAt,
        // No end date = still going; a date far in the future says the same.
        endedAt: event.endedAt ?? new Date(8.64e15),
        positions: track.map((point, i) => ({ at: point.at, distanceKm: list[i] ?? Infinity })),
      });
    }
    console.warn(`  GDACS event used: ${event.title} (${event.kind}, ${event.alertLevel}), from ${day(event.startedAt)}`);
  }
  return byTown;
}

/** Each weather point's archived hourly weather, in Open-Meteo's own shape (point id → that answer). */
async function loadWeather(replay: ReplayCase, points: WeatherPoint[]): Promise<Map<number, unknown>> {
  const byPoint = new Map<number, unknown>();
  const requests = Math.ceil(points.length / WEATHER_POINTS_PER_REQUEST);
  for (let from = 0; from < points.length; from += WEATHER_POINTS_PER_REQUEST) {
    const chunk = points.slice(from, from + WEATHER_POINTS_PER_REQUEST);
    const number = from / WEATHER_POINTS_PER_REQUEST + 1;
    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat.toFixed(4)).join(','),
      longitude: chunk.map((p) => p.lon.toFixed(4)).join(','),
      // One day earlier, so the first hour already has 24 hours of rain behind it.
      start_date: day(new Date(replay.start.getTime() - DAY_MS)),
      end_date: day(replay.end),
      hourly: 'temperature_2m,relative_humidity_2m,precipitation',
      timeformat: 'unixtime',
    });
    // "grid" in the name keeps these apart from older files made with one point per province.
    const name = `${replay.id}-grid-${number}`;
    if (!existsSync(path.join(cacheDir, `${name}.json`))) console.warn(`  weather: request ${number} of ${requests}`);
    const json = await cachedJson(name, `https://archive-api.open-meteo.com/v1/archive?${params}`, WEATHER_PAUSE_MS);
    // For several points the answer is a list; for one point it is a single object.
    const locations = Array.isArray(json) ? json : [json];
    chunk.forEach((point, i) => byPoint.set(point.id, locations[i]));
  }
  return byPoint;
}

/** A reading as the score formulas want it (the same steps as jobs/townInputs.ts). */
function toWeatherInput(reading: WeatherReading | undefined): WeatherInput | null {
  if (!reading) return null;
  return {
    heatIndexC:
      reading.tempC !== null && reading.humidityPct !== null ? heatIndexC(reading.tempC, reading.humidityPct) : null,
    rain1hMm: reading.rain1hMm,
    rain24hMm: reading.rain24hMm,
  };
}

// ---------- Replaying ----------

type ProvinceResult = { province: Province; steps: ReplayStep[] };

async function replayCase(replay: ReplayCase, map: MapData): Promise<ProvinceResult[]> {
  const provinces =
    replay.provinces === 'all' ? map.provinces : map.provinces.filter((p) => replay.provinces.includes(p.name));
  if (replay.provinces !== 'all' && provinces.length !== replay.provinces.length) {
    throw new Error(`${replay.id}: a province name does not match the database.`);
  }
  // Only the towns of these provinces, and only the weather points they read from.
  const wanted = new Set(provinces.map((province) => province.psgc));
  const towns = map.towns.filter((town) => wanted.has(town.provincePsgc));
  const townIds = new Set(towns.map((town) => town.psgc));
  const links = map.links.filter((link) => townIds.has(link.owner));
  const pointIds = new Set(links.map((link) => link.pointId));
  const points = map.points.filter((point) => pointIds.has(point.id));
  console.warn(`  ${provinces.length} provinces, ${towns.length} towns, ${points.length} weather points`);

  const quakes = await loadQuakes(replay, towns);
  const events = await loadEvents(replay, towns);
  const weather = await loadWeather(replay, points);

  // Each town's weather, worked out again only when the live job would have fetched.
  let fetchedAt = -1;
  let weatherByTown = new Map<number, WeatherReading>();

  const steps = new Map<number, ReplayStep[]>(provinces.map((province) => [province.psgc, []]));
  for (let time = replay.start.getTime(); time <= replay.end.getTime(); time += HOUR_MS) {
    const at = new Date(time);
    const fetchAt = weatherFetchAt(at, WEATHER_EVERY_MINUTES);
    if (fetchAt.getTime() !== fetchedAt) {
      fetchedAt = fetchAt.getTime();
      const readings = new Map<number, WeatherReading | null>();
      for (const point of points) readings.set(point.id, parseOpenMeteoLocation(weather.get(point.id), fetchAt));
      weatherByTown = worstByOwner(links, readings);
    }

    // Score every town, then each province takes its highest town.
    const scoredTowns = new Map<number, { psgc: number; area: AreaScore }[]>();
    for (const town of towns) {
      const area = scoreArea(
        quakesAt(quakes.get(town.psgc) ?? [], at),
        toWeatherInput(weatherByTown.get(town.psgc)),
        eventsAt(events.get(town.psgc) ?? [], at),
        [],
      );
      const list = scoredTowns.get(town.provincePsgc) ?? [];
      list.push({ psgc: town.psgc, area });
      scoredTowns.set(town.provincePsgc, list);
    }
    for (const province of provinces) {
      const step = provinceStep(at, scoredTowns.get(province.psgc) ?? []);
      if (step) steps.get(province.psgc)?.push(step);
    }
  }
  return provinces.map((province) => ({ province, steps: steps.get(province.psgc) ?? [] }));
}

// ---------- Printing ----------

/** "Nov 8, 05:00" in Philippine time (8 hours ahead of UTC). */
function philippineTime(date: Date): string {
  return date.toLocaleString('en-US', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
}

function parts(step: ReplayStep): string {
  return `quake ${step.quake}, weather ${step.weather ?? 'none'}, event ${step.event}`;
}

/** Town psgc → name, filled once the map is read. */
const townNames = new Map<number, string>();
const townName = (step: ReplayStep) => (step.town === null ? '?' : (townNames.get(step.town) ?? String(step.town)));

function comparedWithKey(hours: number): string {
  if (Math.abs(hours) < 1) return hours <= 0 ? 'at the time' : 'within the hour after';
  const rounded = Math.round(Math.abs(hours));
  return `${rounded} h ${hours < 0 ? 'before' : 'after'}`;
}

function printKnownCase(replay: ReplayCase, results: ProvinceResult[], keyTime: Date): void {
  console.log(`\n### ${replay.title}\n`);
  console.log(`Key time: ${replay.keyLabel}. Times are Philippine time.\n`);
  console.log(
    `| Province | Peak | Peak at | Town at the peak | Parts at the peak | First "High" (${HIGH_FROM}+) | Compared with the key time |`,
  );
  console.log('|---|---|---|---|---|---|---|');
  for (const { province, steps } of results) {
    const summary = summarize(steps, keyTime);
    if (!summary.peak) continue;
    const first = summary.firstHighAt ? philippineTime(summary.firstHighAt) : 'never';
    const compared = summary.hoursFromKey === null ? 'not reached' : comparedWithKey(summary.hoursFromKey);
    console.log(
      `| ${province.name} | ${summary.peak.score} | ${philippineTime(summary.peak.at)} | ${townName(summary.peak)} | ${parts(summary.peak)} | ${first} | ${compared} |`,
    );
  }
}

function printOrdinaryWeek(replay: ReplayCase, results: ProvinceResult[]): void {
  console.log(`\n### ${replay.title}\n`);
  const hours = results.reduce((total, result) => total + result.steps.length, 0);
  const summaries = results.map((result) => ({ ...result, summary: summarize(result.steps, replay.start) }));
  const withHigh = summaries.filter((entry) => entry.summary.highHours > 0);
  const highHours = withHigh.reduce((total, entry) => total + entry.summary.highHours, 0);
  // What put each "High" hour there: the weather alone, and which kind of rain.
  const highSteps = results.flatMap((result) => result.steps.filter((step) => step.score >= HIGH_FROM));
  const weatherAlone = highSteps.filter((step) => (step.weather ?? 0) >= HIGH_FROM).length;
  const oneHourHigh = (step: ReplayStep) =>
    rainScore({ rain1hMm: step.rain1hMm, rain24hMm: null, heatIndexC: null }) >= HIGH_FROM;
  const dayHigh = (step: ReplayStep) =>
    rainScore({ rain1hMm: null, rain24hMm: step.rain24hMm, heatIndexC: null }) >= HIGH_FROM;
  const oneHourOnly = highSteps.filter((step) => oneHourHigh(step) && !dayHigh(step)).length;
  const dayOnly = highSteps.filter((step) => dayHigh(step) && !oneHourHigh(step)).length;
  const both = highSteps.filter((step) => oneHourHigh(step) && dayHigh(step)).length;
  console.log(
    `${results.length} provinces × ${results[0]?.steps.length ?? 0} hours = ${hours} province-hours. ` +
      `"High" or above: ${highHours} province-hours, in ${withHigh.length} provinces. ` +
      `In ${weatherAlone} of them the weather alone scored ${HIGH_FROM} or more.\n`,
  );
  console.log(
    `Which rain was enough for "High": one hour only ${oneHourOnly}, 24 hours only ${dayOnly}, both ${both}.\n`,
  );
  console.log('The ten highest peaks of the week:\n');
  console.log('| Province | Peak | Peak at | Town at the peak | Parts at the peak | Rain 1 h / 24 h (mm) | Hours at "High" |');
  console.log('|---|---|---|---|---|---|---|');
  // Sort a copy from the highest peak down and keep the first ten.
  const top = [...summaries].sort((a, b) => (b.summary.peak?.score ?? 0) - (a.summary.peak?.score ?? 0)).slice(0, 10);
  for (const { province, summary } of top) {
    if (!summary.peak) continue;
    console.log(
      `| ${province.name} | ${summary.peak.score} | ${philippineTime(summary.peak.at)} | ${townName(summary.peak)} | ${parts(summary.peak)} | ${summary.peak.rain1hMm ?? 0} / ${summary.peak.rain24hMm ?? 0} | ${summary.highHours} |`,
    );
  }
}

// ---------- Run ----------

try {
  await mkdir(cacheDir, { recursive: true });
  // Another wet day amount, or the rule off, for this run only. It changes nothing saved.
  const wetDayMm = process.env.WET_DAY_MM;
  if (wetDayMm === 'off') {
    WEIGHTS.rain.oneHourCap.needsDayMm = null;
  } else if (wetDayMm) {
    const mm = Number(wetDayMm);
    if (!Number.isFinite(mm) || mm <= 0) throw new Error(`WET_DAY_MM must be a number of mm or "off", not "${wetDayMm}".`);
    WEIGHTS.rain.oneHourCap.needsDayMm = mm;
  }
  const rule = WEIGHTS.rain.oneHourCap.needsDayMm;
  console.log(
    rule === null
      ? '> Wet day rule OFF: one heavy hour is enough for "High".\n'
      : `> Wet day rule ON: a heavy hour (under 30 mm) reaches "High" only after ${rule} mm in 24 hours.\n`,
  );
  // The map, read once. `AS "provincePsgc"` keeps the capital letter (SQL lowercases names).
  const provinces = await pool.query<Province>('SELECT psgc, name FROM provinces ORDER BY name');
  const towns = await pool.query<Town>('SELECT psgc, name, province_psgc AS "provincePsgc" FROM places ORDER BY psgc');
  const points = await pool.query<WeatherPoint>(
    'SELECT id, ST_Y(geom) AS lat, ST_X(geom) AS lon FROM weather_points ORDER BY id',
  );
  const links = await pool.query<PointLink>(
    'SELECT place_psgc AS owner, point_id AS "pointId" FROM place_weather_points',
  );
  if (towns.rows.length === 0 || links.rows.length === 0) {
    throw new Error('No towns or weather points yet. Run npm run load-places, then npm run weather-points.');
  }
  for (const town of towns.rows) townNames.set(town.psgc, town.name);
  const map: MapData = { provinces: provinces.rows, towns: towns.rows, points: points.rows, links: links.rows };
  // Progress notes go to the error stream (console.warn), so the tables can be
  // saved on their own: npm run replay > results.md
  for (const replay of CASES) {
    console.warn(`Replaying: ${replay.title}`);
    const results = await replayCase(replay, map);
    if (replay.keyTime) printKnownCase(replay, results, replay.keyTime);
    else printOrdinaryWeek(replay, results);
  }
} catch (error) {
  console.error('Replay failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
