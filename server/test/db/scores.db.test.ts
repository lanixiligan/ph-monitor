// Database tests for the score job (src/jobs/computeScores.ts): its SQL runs
// against real PostGIS with a small seeded map. Run with: npm run test:db

import {
  addEvent, addQuake, addWeather, ALPHA, BRAVO, CHARLIE, hoursAgo, minutesAgo, pool, resetDb, setFeedRuns,
} from './testDb.ts';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { computeScores } from '../../src/jobs/computeScores.ts';

type ScoreRow = {
  score: number;
  quake_score: number;
  weather_score: number;
  event_score: number;
  unknown_signals: string[];
};

async function scoreOf(psgc: number): Promise<ScoreRow> {
  const result = await pool.query<ScoreRow>(
    'SELECT score, quake_score, weather_score, event_score, unknown_signals FROM province_scores WHERE province_psgc = $1',
    [psgc],
  );
  const row = result.rows[0];
  assert.ok(row, `no score saved for province ${psgc}`);
  return row;
}

async function historyCount(psgc?: number): Promise<number> {
  const result = await pool.query<{ n: number }>(
    'SELECT count(*) AS n FROM province_score_history WHERE $1::bigint IS NULL OR province_psgc = $1',
    [psgc ?? null],
  );
  return result.rows[0]?.n ?? 0;
}

before(async () => {
  await resetDb();
  await setFeedRuns();
  // Alpha: a strong quake inside it an hour ago, and light rain.
  await addQuake('q1', { lat: 14.5, lon: 121.5, magnitude: 6.5, occurredAt: hoursAgo(1), reachKm: 280 });
  await addWeather(ALPHA, { validAt: minutesAgo(30), rain1hMm: 0, rain24hMm: 5 });
  // Bravo: heavy rain, no quake. An older reading must lose to the newer one.
  await addWeather(BRAVO, { validAt: minutesAgo(90), rain1hMm: 0, rain24hMm: 0 });
  await addWeather(BRAVO, { validAt: minutesAgo(30), rain1hMm: 30, rain24hMm: 120 });
  // Charlie: its only reading is too old to use.
  await addWeather(CHARLIE, { validAt: hoursAgo(5), rain1hMm: 50, rain24hMm: 300 });
});

// Close the connections, otherwise the test run would never exit.
after(() => pool.end());

test('score job: a quake counts only for the provinces it is linked to', async () => {
  await computeScores();
  const alpha = await scoreOf(ALPHA);
  const bravo = await scoreOf(BRAVO);
  assert.ok(alpha.quake_score >= 60, `Alpha quake score was ${alpha.quake_score}`);
  assert.equal(bravo.quake_score, 0);
  assert.ok(alpha.score >= alpha.quake_score);
});

test('score job: the newest reading is used, and a reading older than 3 hours means "unknown", not calm', async () => {
  const bravo = await scoreOf(BRAVO);
  const charlie = await scoreOf(CHARLIE);
  assert.equal(bravo.weather_score, 85); // 30 mm in an hour = red rainfall
  assert.deepEqual(bravo.unknown_signals, []);
  assert.equal(charlie.weather_score, 0);
  assert.deepEqual(charlie.unknown_signals, ['weather']);
});

test('score history: the first run saves every province with its part-scores; an unchanged run saves nothing', async () => {
  assert.equal(await historyCount(), 3);
  const saved = await pool.query<{ quake_score: number; weather_score: number; event_score: number; unknown_signals: string[] }>(
    'SELECT quake_score, weather_score, event_score, unknown_signals FROM province_score_history WHERE province_psgc = $1',
    [BRAVO],
  );
  assert.deepEqual(saved.rows, [{ quake_score: 0, weather_score: 85, event_score: 0, unknown_signals: [] }]);

  // USGS withdrew the quake: only Alpha's score changes.
  await pool.query(`DELETE FROM earthquakes WHERE id = 'q1'`);
  await computeScores();
  assert.equal(await historyCount(ALPHA), 2); // Alpha changed (its quake is gone)
  assert.equal(await historyCount(BRAVO), 1); // Bravo and Charlie did not
  assert.equal(await historyCount(CHARLIE), 1);

  await computeScores();
  assert.equal(await historyCount(), 4);
});

test('score job: a red event counts within its reach, fading with distance', async () => {
  // 50 km east of Bravo's edge; Alpha is about 500 km away.
  await addEvent('gdacs:TC:1', { lat: 10.5, lon: 125.46, alertLevel: 'red' });
  await computeScores();
  const bravo = await scoreOf(BRAVO);
  const alpha = await scoreOf(ALPHA);
  assert.ok(bravo.event_score > 20 && bravo.event_score < 80, `Bravo event score was ${bravo.event_score}`);
  assert.equal(alpha.event_score, 0);
});

test('score job: an open event its feed stopped listing a day ago is ignored', async () => {
  await pool.query(`UPDATE events SET fetched_at = $1 WHERE id = 'gdacs:TC:1'`, [hoursAgo(25)]);
  await computeScores();
  assert.equal((await scoreOf(BRAVO)).event_score, 0);
});

test('score job: when the earthquake feed is out of date, every province is "at least", never calm', async () => {
  await setFeedRuns(61, ['usgs']);
  await computeScores();
  for (const psgc of [ALPHA, BRAVO]) {
    assert.deepEqual((await scoreOf(psgc)).unknown_signals, ['quake']);
  }
  assert.deepEqual((await scoreOf(CHARLIE)).unknown_signals, ['quake', 'weather']);
});
