// Historical replay: feeds the score formulas with archived data from known
// disasters and from one ordinary week, and prints "did the affected
// provinces reach High, and when?". Run with: npm run replay
//
// It changes nothing: it only reads the provinces from the database and
// never saves a score. The weights are not touched (tuning is a later step).
//
// Archives used (downloaded once into data/replay/, then reused):
//   USGS            past earthquakes (the same service as the live feed)
//   Open-Meteo      archived hourly weather (ERA5 reanalysis, not the live forecast model)
//   GDACS           past disaster events with their final alert level
//   JMA best track  where each past typhoon was, every 6 hours
//
// How it differs from the live app (read the results with this in mind):
//   - Rain comes from a coarser archive model, which smooths out typhoon rain.
//   - One weather point per province (the live app uses the worst of several).
//   - A GDACS event has its FINAL alert level from its first hour.
//   - Every feed is treated as working (nothing is "unknown").
//   - Scores are worked out once an hour, on the hour.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../src/db.ts';
import { parseGdacsApi } from '../src/fetchers/gdacs.ts';
import { parseOpenMeteoLocation } from '../src/fetchers/openMeteo.ts';
import { parseUsgsFeed, QUAKE_BOX } from '../src/fetchers/usgs.ts';
import { heatIndexC } from '../src/heatIndex.ts';
import { eventsAt, HIGH_FROM, parseBestTrack, quakesAt, summarize } from '../src/replay/replay.ts';
import type { ProvinceEvent, ProvinceQuake, ReplayStep } from '../src/replay/replay.ts';
import { combineSignals, eventScore, quakeScore, radiusKm, weatherScore, WEIGHTS } from '../src/scoring/scoring.ts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
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

type Province = { psgc: number; name: string; lat: number; lon: number };

// ---------- Downloading (each file once) ----------

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Downloads a JSON file, or reads the copy kept from an earlier run. */
async function cachedJson(name: string, url: string): Promise<unknown> {
  const file = path.join(cacheDir, `${name}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status} from ${new URL(url).host}`);
  // An empty answer (GDACS sends one when nothing matches) is kept as "no events".
  const text = (await response.text()) || '{"features":[]}';
  await writeFile(file, text);
  // Be gentle with the archives: wait between downloads.
  await pause(1500);
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

/** Distance in km from each province's edge to each position. Answer: psgc → one distance per position. */
async function distancesKm(provinces: Province[], positions: { lat: number; lon: number }[]): Promise<Map<number, number[]>> {
  const answer = new Map<number, number[]>(provinces.map((province) => [province.psgc, []]));
  if (positions.length === 0) return answer;
  // unnest turns the two lists into rows; WITH ORDINALITY numbers them 1, 2, 3...
  const result = await pool.query<{ psgc: number; n: number; km: number }>(
    `SELECT p.psgc, i.n, ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint(i.lon, i.lat), 4326)::geography) / 1000 AS km
     FROM provinces p, unnest($1::float8[], $2::float8[]) WITH ORDINALITY AS i(lon, lat, n)
     WHERE p.psgc = ANY($3::bigint[])
     ORDER BY p.psgc, i.n`,
    [positions.map((p) => p.lon), positions.map((p) => p.lat), provinces.map((p) => p.psgc)],
  );
  for (const row of result.rows) answer.get(row.psgc)?.push(row.km);
  return answer;
}

// ---------- Gathering one case's archived data ----------

async function loadQuakes(replay: ReplayCase, provinces: Province[]): Promise<Map<number, ProvinceQuake[]>> {
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
  const distances = await distancesKm(provinces, quakes);

  const byProvince = new Map<number, ProvinceQuake[]>();
  for (const province of provinces) {
    const list: ProvinceQuake[] = [];
    quakes.forEach((quake, i) => {
      const distanceKm = distances.get(province.psgc)?.[i];
      // The same reach rule as the earthquake job.
      if (distanceKm === undefined || distanceKm > radiusKm(quake.magnitude)) return;
      list.push({ magnitude: quake.magnitude, depthKm: quake.depthKm, distanceKm, occurredAt: quake.occurredAt });
    });
    byProvince.set(province.psgc, list);
  }
  return byProvince;
}

async function loadEvents(replay: ReplayCase, provinces: Province[]): Promise<Map<number, ProvinceEvent[]>> {
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

  const byProvince = new Map<number, ProvinceEvent[]>(provinces.map((province) => [province.psgc, []]));
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

    const distances = await distancesKm(provinces, track);
    for (const province of provinces) {
      const list = distances.get(province.psgc) ?? [];
      byProvince.get(province.psgc)?.push({
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
  return byProvince;
}

/** Each province's archived hourly weather, in Open-Meteo's own shape (psgc → that answer). */
async function loadWeather(replay: ReplayCase, provinces: Province[]): Promise<Map<number, unknown>> {
  const byProvince = new Map<number, unknown>();
  const CHUNK = 50;
  for (let from = 0; from < provinces.length; from += CHUNK) {
    const chunk = provinces.slice(from, from + CHUNK);
    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat.toFixed(4)).join(','),
      longitude: chunk.map((p) => p.lon.toFixed(4)).join(','),
      // One day earlier, so the first hour already has 24 hours of rain behind it.
      start_date: day(new Date(replay.start.getTime() - DAY_MS)),
      end_date: day(replay.end),
      hourly: 'temperature_2m,relative_humidity_2m,precipitation',
      timeformat: 'unixtime',
    });
    const json = await cachedJson(
      `${replay.id}-weather-${from / CHUNK + 1}`,
      `https://archive-api.open-meteo.com/v1/archive?${params}`,
    );
    // For several points the answer is a list; for one point it is a single object.
    const locations = Array.isArray(json) ? json : [json];
    chunk.forEach((province, i) => byProvince.set(province.psgc, locations[i]));
  }
  return byProvince;
}

// ---------- Replaying ----------

type ProvinceResult = { province: Province; steps: ReplayStep[] };

async function replayCase(replay: ReplayCase, allProvinces: Province[]): Promise<ProvinceResult[]> {
  const provinces =
    replay.provinces === 'all' ? allProvinces : allProvinces.filter((p) => replay.provinces.includes(p.name));
  if (replay.provinces !== 'all' && provinces.length !== replay.provinces.length) {
    throw new Error(`${replay.id}: a province name does not match the database.`);
  }

  const quakes = await loadQuakes(replay, provinces);
  const events = await loadEvents(replay, provinces);
  const weather = await loadWeather(replay, provinces);

  return provinces.map((province) => {
    const steps: ReplayStep[] = [];
    for (let time = replay.start.getTime(); time <= replay.end.getTime(); time += HOUR_MS) {
      const at = new Date(time);
      const reading = parseOpenMeteoLocation(weather.get(province.psgc), at);
      const weatherPoints = weatherScore(
        reading && {
          rain1hMm: reading.rain1hMm,
          rain24hMm: reading.rain24hMm,
          heatIndexC:
            reading.tempC !== null && reading.humidityPct !== null
              ? heatIndexC(reading.tempC, reading.humidityPct)
              : null,
        },
      );
      const quakePoints = quakeScore(quakesAt(quakes.get(province.psgc) ?? [], at));
      const eventPoints = eventScore(eventsAt(events.get(province.psgc) ?? [], at));
      const { score } = combineSignals({ quake: quakePoints, weather: weatherPoints, event: eventPoints });
      steps.push({ at, score, quake: quakePoints, weather: weatherPoints, event: eventPoints });
    }
    return { province, steps };
  });
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

function comparedWithKey(hours: number): string {
  if (Math.abs(hours) < 1) return hours <= 0 ? 'at the time' : 'within the hour after';
  const rounded = Math.round(Math.abs(hours));
  return `${rounded} h ${hours < 0 ? 'before' : 'after'}`;
}

function printKnownCase(replay: ReplayCase, results: ProvinceResult[], keyTime: Date): void {
  console.log(`\n### ${replay.title}\n`);
  console.log(`Key time: ${replay.keyLabel}. Times are Philippine time.\n`);
  console.log(`| Province | Peak | Peak at | Parts at the peak | First "High" (${HIGH_FROM}+) | Compared with the key time |`);
  console.log('|---|---|---|---|---|---|');
  for (const { province, steps } of results) {
    const summary = summarize(steps, keyTime);
    if (!summary.peak) continue;
    const first = summary.firstHighAt ? philippineTime(summary.firstHighAt) : 'never';
    const compared = summary.hoursFromKey === null ? 'not reached' : comparedWithKey(summary.hoursFromKey);
    console.log(
      `| ${province.name} | ${summary.peak.score} | ${philippineTime(summary.peak.at)} | ${parts(summary.peak)} | ${first} | ${compared} |`,
    );
  }
}

function printOrdinaryWeek(replay: ReplayCase, results: ProvinceResult[]): void {
  console.log(`\n### ${replay.title}\n`);
  const hours = results.reduce((total, result) => total + result.steps.length, 0);
  const summaries = results.map((result) => ({ ...result, summary: summarize(result.steps, replay.start) }));
  const withHigh = summaries.filter((entry) => entry.summary.highHours > 0);
  const highHours = withHigh.reduce((total, entry) => total + entry.summary.highHours, 0);
  console.log(
    `${results.length} provinces × ${results[0]?.steps.length ?? 0} hours = ${hours} province-hours. ` +
      `"High" or above: ${highHours} province-hours, in ${withHigh.length} provinces.\n`,
  );
  console.log('The five highest peaks of the week:\n');
  console.log('| Province | Peak | Peak at | Parts at the peak | Hours at "High" |');
  console.log('|---|---|---|---|---|');
  // Sort a copy from the highest peak down and keep the first five.
  const top = [...summaries].sort((a, b) => (b.summary.peak?.score ?? 0) - (a.summary.peak?.score ?? 0)).slice(0, 5);
  for (const { province, summary } of top) {
    if (!summary.peak) continue;
    console.log(
      `| ${province.name} | ${summary.peak.score} | ${philippineTime(summary.peak.at)} | ${parts(summary.peak)} | ${summary.highHours} |`,
    );
  }
}

// ---------- Run ----------

try {
  await mkdir(cacheDir, { recursive: true });
  const provinces = await pool.query<Province>(
    `SELECT psgc, name, ST_Y(weather_point) AS lat, ST_X(weather_point) AS lon FROM provinces ORDER BY name`,
  );
  // Progress notes go to the error stream (console.warn), so the tables can be
  // saved on their own: npm run replay > results.md
  for (const replay of CASES) {
    console.warn(`Replaying: ${replay.title}`);
    const results = await replayCase(replay, provinces.rows);
    if (replay.keyTime) printKnownCase(replay, results, replay.keyTime);
    else printOrdinaryWeek(replay, results);
  }
} catch (error) {
  console.error('Replay failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
