// Database tests for the status card's extra sections (src/conditions.ts):
// nearby events, the storm path, official alerts, the outlook and headlines.
// Run with: npm run test:db

import {
  addAlert, addEvent, addNews, addStorm, ALPHA, BRAVO, hoursAgo, hoursAhead, pool, resetDb, SPOT,
} from './testDb.ts';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { getConditions, getOfficialAlerts } from '../../src/conditions.ts';

const DAY_HOURS = 24;

before(async () => {
  await resetDb();
});

// Close the connections, otherwise the test run would never exit.
after(() => pool.end());

test('nearby events: within 300 km and current, nearest first, with the distance from the spot', async () => {
  await addEvent('near-open', { lat: 15.5, lon: 121.5 }); // about 111 km north
  await addEvent('near-ended', { lat: 14.5, lon: 123.5, endedAt: hoursAgo(2 * DAY_HOURS) }); // about 215 km east
  await addEvent('ended-long-ago', { lat: 14.6, lon: 121.5, endedAt: hoursAgo(8 * DAY_HOURS) });
  await addEvent('too-far', { lat: 8, lon: 126 });
  await addEvent('feed-dropped-it', { lat: 14.6, lon: 121.6, fetchedAt: hoursAgo(25) });

  const { nearbyEvents } = await getConditions(ALPHA, SPOT);
  assert.deepEqual(nearbyEvents.map((event) => event.id), ['near-open', 'near-ended']);
  const distance = nearbyEvents[0]?.distanceKm ?? 0;
  assert.ok(distance >= 108 && distance <= 114, `distance was ${distance} km`);
});

test('nearby events: for a whole province the distance is measured from its edge', async () => {
  // 'near-open' is 0.5 degrees (about 55 km) north of Alpha's north edge.
  const { nearbyEvents } = await getConditions(ALPHA, null);
  const event = nearbyEvents.find((entry) => entry.id === 'near-open');
  const distance = event?.distanceKm ?? 0;
  assert.ok(distance >= 53 && distance <= 58, `distance was ${distance} km`);
});

test('storm path: the distance is to the line between forecast positions, with the time read in between', async () => {
  // The storm moves west along lat 13, then turns north along lon 123. It
  // passes the spot (121.5, 14.5) between two forecast positions: the line
  // comes within about 161 km, the positions themselves stay over 230 km away.
  await addStorm('passing', {
    track: [
      { lat: 12, lon: 128, validAt: hoursAgo(7), isForecast: false }, // an old position: not part of the path
      { lat: 13, lon: 126, validAt: hoursAgo(1), isForecast: false }, // where it is now
      { lat: 13, lon: 123, validAt: hoursAhead(12), isForecast: true },
      { lat: 16, lon: 123, validAt: hoursAhead(24), isForecast: true },
      { lat: 19, lon: 121, validAt: hoursAhead(36), isForecast: true },
    ],
  });
  const overhead = [
    { lat: 14.5, lon: 121.5, validAt: hoursAgo(1), isForecast: false },
    { lat: 15, lon: 121, validAt: hoursAhead(12), isForecast: true },
  ];
  await addStorm('no-longer-active', { isActive: false, track: overhead });
  await addStorm('far-away', {
    track: [
      { lat: 14, lon: 135, validAt: hoursAgo(1), isForecast: false },
      { lat: 16, lon: 133, validAt: hoursAhead(12), isForecast: true },
    ],
  });
  await addStorm('already-passed', {
    track: [
      { lat: 14.5, lon: 121.5, validAt: hoursAgo(30), isForecast: false },
      { lat: 15, lon: 121, validAt: hoursAgo(13), isForecast: true },
    ],
  });

  const { stormsComing } = await getConditions(ALPHA, SPOT);
  assert.deepEqual(stormsComing.map((storm) => storm.stormId), ['passing']);
  const storm = stormsComing[0];
  assert.ok(storm);
  assert.ok(storm.distanceKm >= 155 && storm.distanceKm <= 167, `distance was ${storm.distanceKm} km`);
  // Halfway between the +12 h and +24 h positions: about 18 hours from now.
  const hoursFromNow = (new Date(storm.closestAt).getTime() - Date.now()) / (60 * 60 * 1000);
  assert.ok(hoursFromNow > 17 && hoursFromNow < 19, `closest in ${hoursFromNow} hours`);
});

test('storm path: for a whole province the distance is from its edge to the path', async () => {
  // Bravo's north edge is lat 11; the storm's path runs along lat 13 (about 221 km).
  const { stormsComing } = await getConditions(BRAVO, null);
  assert.deepEqual(stormsComing.map((storm) => storm.stormId), ['passing']);
  const distance = stormsComing[0]?.distanceKm ?? 0;
  assert.ok(distance >= 215 && distance <= 226, `distance was ${distance} km`);
});

test('official alerts: only those in effect, for this province or the whole country, newest first', async () => {
  await addAlert('for-alpha', { sentAt: hoursAgo(2), expiresAt: hoursAhead(4), provincePsgcs: [ALPHA] });
  await addAlert('nationwide', { sentAt: hoursAgo(1), expiresAt: hoursAhead(4), isNationwide: true });
  await addAlert('expired', { sentAt: hoursAgo(9), expiresAt: hoursAgo(1), provincePsgcs: [ALPHA] });
  await addAlert('replaced', { sentAt: hoursAgo(3), expiresAt: hoursAhead(4), provincePsgcs: [ALPHA], isReplaced: true });
  await addAlert('all-clear', { sentAt: hoursAgo(3), expiresAt: hoursAhead(4), provincePsgcs: [ALPHA], isAllClear: true });

  const ids = async (psgc: number | null) => (await getOfficialAlerts(psgc)).map((alert) => alert.id);
  assert.deepEqual(await ids(ALPHA), ['nationwide', 'for-alpha']);
  assert.deepEqual(await ids(BRAVO), ['nationwide']);
  assert.deepEqual(await ids(null), ['nationwide', 'for-alpha']);
  // The card gets the same list, and province codes come back as numbers.
  const card = await getConditions(ALPHA, SPOT);
  assert.deepEqual(card.officialAlerts.map((alert) => alert.id), ['nationwide', 'for-alpha']);
  assert.deepEqual(card.officialAlerts[1]?.provincePsgcs, [ALPHA]);
});

test('outlook and headlines: 7 days from today (Philippine time); the 5 newest headlines of the last 3 days', async () => {
  // Days -1 to +8 around today in Philippine time; the rain amount is the day's offset.
  await pool.query(
    `INSERT INTO forecast_days (province_psgc, day, rain_mm, gust_kmh, river_discharge_m3s)
     SELECT $1, (now() AT TIME ZONE 'Asia/Manila')::date + n, n, 20, NULL
     FROM generate_series(-1, 8) AS n`,
    [ALPHA],
  );
  for (let hours = 1; hours <= 6; hours++) await addNews(`Alpha story ${hours}`, hoursAgo(hours), [ALPHA]);
  await addNews('Alpha story, too old', hoursAgo(4 * DAY_HOURS), [ALPHA]);
  await addNews('Bravo story', hoursAgo(1), [BRAVO]);

  const { outlook, news } = await getConditions(ALPHA, SPOT);
  assert.deepEqual(outlook.map((day) => day.rainMm), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(
    news.map((item) => item.title),
    ['Alpha story 1', 'Alpha story 2', 'Alpha story 3', 'Alpha story 4', 'Alpha story 5'],
  );
});
