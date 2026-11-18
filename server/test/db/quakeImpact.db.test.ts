// Database tests for USGS's impact estimates (PAGER alert, shaking intensity,
// tsunami link) on the status card. They are read from the saved USGS record
// when the card is asked for, so quakes saved earlier show them too. They are
// for display only: the score must not change. Run with: npm run test:db

import { addQuake, ALPHA, hoursAgo, pool, resetDb, setFeedRuns, SPOT } from './testDb.ts';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import express from 'express';
import type { EarthquakeEvent, HazardEvent, PointDetail, ProvinceDetail } from '@ph-monitor/shared';
import { pointRouter } from '../../src/routes/point.ts';
import { provincesRouter } from '../../src/routes/provinces.ts';

const realFetch = globalThis.fetch;
let server: Server;
let baseUrl = '';

/** A pretend Open-Meteo answer: 25 dry hours ending now. */
function pretendWeather(): Response {
  const thisHour = Math.floor(Date.now() / 3_600_000) * 3600;
  const time = Array.from({ length: 25 }, (_, i) => thisHour - (24 - i) * 3600);
  const hourly = {
    time,
    temperature_2m: time.map(() => 30),
    relative_humidity_2m: time.map(() => 70),
    precipitation: time.map(() => 0),
  };
  return Response.json({ hourly });
}

async function get(path: string): Promise<unknown> {
  const response = await realFetch(`${baseUrl}${path}`);
  assert.equal(response.status, 200);
  return response.json();
}

/** Replaces a saved quake's USGS record, the part the impact fields are read from. */
async function setRaw(id: string, raw: unknown): Promise<void> {
  await pool.query('UPDATE earthquakes SET raw = $2 WHERE id = $1', [id, JSON.stringify(raw)]);
}

/** The earthquake with this id from a card's list of events. */
function quakeById(events: HazardEvent[], id: string): EarthquakeEvent {
  const quake = events.find((event) => event.kind === 'earthquake' && event.id === id);
  // After assert.ok passes, TypeScript knows `quake` is an earthquake, not weather.
  assert.ok(quake && quake.kind === 'earthquake', `no quake ${id}`);
  return quake;
}

before(async () => {
  await resetDb();
  await setFeedRuns();
  // Two quakes north of the spot, both close enough to count.
  await addQuake('with-impact', { lat: 15.0, lon: 121.5, magnitude: 6, occurredAt: hoursAgo(2), reachKm: 200 });
  await addQuake('without-impact', { lat: 14.9, lon: 121.4, magnitude: 5, occurredAt: hoursAgo(3), reachKm: 200 });
  await setRaw('with-impact', { id: 'with-impact', properties: { mag: 6, alert: 'orange', mmi: 7.2, tsunami: 1 } });
  await setRaw('without-impact', { id: 'without-impact', properties: { mag: 5 } });

  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('https://api.open-meteo.com/')) throw new Error(`A test tried to fetch ${url}`);
    return pretendWeather();
  };

  const app = express();
  app.use('/api/provinces', provincesRouter);
  app.use('/api/point', pointRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  server.close();
  await pool.end();
});

test('spot card: each quake carries the impact fields from its saved USGS record', async () => {
  const detail = (await get(`/api/point?lat=${SPOT.lat}&lon=${SPOT.lon}`)) as PointDetail;
  const withImpact = quakeById(detail.events, 'with-impact');
  assert.equal(withImpact.pagerAlert, 'orange');
  assert.equal(withImpact.mmi, 7.2);
  assert.equal(withImpact.tsunamiInfo, true);

  const withoutImpact = quakeById(detail.events, 'without-impact');
  assert.equal(withoutImpact.pagerAlert, null);
  assert.equal(withoutImpact.mmi, null);
  assert.equal(withoutImpact.tsunamiInfo, false);
});

test('province card: the same fields on the quakes linked to the province', async () => {
  const detail = (await get(`/api/provinces/${ALPHA}`)) as ProvinceDetail;
  const withImpact = quakeById(detail.events, 'with-impact');
  assert.deepEqual(
    [withImpact.pagerAlert, withImpact.mmi, withImpact.tsunamiInfo],
    ['orange', 7.2, true],
  );
  const withoutImpact = quakeById(detail.events, 'without-impact');
  assert.deepEqual(
    [withoutImpact.pagerAlert, withoutImpact.mmi, withoutImpact.tsunamiInfo],
    [null, null, false],
  );
});

test('a record with no properties at all (or a strange alert) still gives a card', async () => {
  await setRaw('without-impact', {});
  await setRaw('with-impact', { properties: { alert: 'purple', mmi: 7.2, tsunami: 1 } });
  const detail = (await get(`/api/point?lat=${SPOT.lat}&lon=${SPOT.lon}`)) as PointDetail;
  const odd = quakeById(detail.events, 'with-impact');
  assert.deepEqual([odd.pagerAlert, odd.mmi, odd.tsunamiInfo], [null, 7.2, true]);
  const empty = quakeById(detail.events, 'without-impact');
  assert.deepEqual([empty.pagerAlert, empty.mmi, empty.tsunamiInfo], [null, null, false]);
});

test('the score is the same with and without the impact fields', async () => {
  const spot = `/api/point?lat=${SPOT.lat}&lon=${SPOT.lon}`;
  await setRaw('with-impact', { properties: { alert: 'red', mmi: 9, tsunami: 1 } });
  const withFields = ((await get(spot)) as PointDetail).score;
  await setRaw('with-impact', { properties: {} });
  const withoutFields = ((await get(spot)) as PointDetail).score;

  assert.ok(withFields.quakeScore > 0, 'the quakes should count towards the score');
  // computedAt is the moment of the request, so it is blanked out. `{ ...x, k: v }`
  // copies every field of x and then sets k.
  assert.deepEqual({ ...withFields, computedAt: '' }, { ...withoutFields, computedAt: '' });
});
