// Checks that the feed parsers accept good records and reject bad ones.
// Run with: npm test
// No network or database is used: the samples below are copied from real feeds.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOpenMeteoLocation } from '../src/fetchers/openMeteo.ts';
import { parseUsgsFeed } from '../src/fetchers/usgs.ts';
import { heatIndexC } from '../src/heatIndex.ts';

// One real USGS record (trimmed to the fields we read, plus one extra).
const goodQuake = {
  type: 'Feature',
  id: 'us7000ty9v',
  properties: {
    mag: 4.6,
    place: '96 km SSE of Pondaguitan, Philippines',
    time: 1794675399533,
    url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000ty9v',
    status: 'reviewed',
  },
  geometry: { type: 'Point', coordinates: [126.6097, 5.5982, 65.399] },
};

test('USGS: a good record is accepted and converted', () => {
  const result = parseUsgsFeed({ features: [goodQuake] });

  assert.equal(result.skipped, 0);
  assert.equal(result.quakes.length, 1);

  const quake = result.quakes[0];
  assert.equal(quake?.id, 'us7000ty9v');
  assert.equal(quake?.magnitude, 4.6);
  assert.equal(quake?.depthKm, 65.399);
  assert.equal(quake?.lon, 126.6097);
  assert.equal(quake?.lat, 5.5982);
  assert.equal(quake?.occurredAt.toISOString(), '2026-11-14T16:56:39.533Z');
});

test('USGS: a missing depth is allowed', () => {
  const noDepth = {
    ...goodQuake,
    geometry: { type: 'Point', coordinates: [126.6097, 5.5982, null] },
  };
  const result = parseUsgsFeed({ features: [noDepth] });

  assert.equal(result.quakes[0]?.depthKm, null);
});

test('USGS: broken records are skipped, good ones are kept', () => {
  const noMagnitude = { ...goodQuake, id: 'bad1', properties: { ...goodQuake.properties, mag: null } };
  const badLatitude = {
    ...goodQuake,
    id: 'bad2',
    geometry: { type: 'Point', coordinates: [126.6, 95, 10] },
  };
  const noId = { ...goodQuake, id: undefined };

  const result = parseUsgsFeed({
    features: [noMagnitude, goodQuake, badLatitude, noId, 'not even an object'],
  });

  assert.equal(result.quakes.length, 1);
  assert.equal(result.quakes[0]?.id, 'us7000ty9v');
  assert.equal(result.skipped, 4);
});

test('USGS: a response that is not a feed at all throws', () => {
  assert.throws(() => parseUsgsFeed({ error: 'server exploded' }));
});

// ---------- Open-Meteo ----------

// 25 hourly values ending at 03:00 UTC on 15 Nov 2026 (1794711600 seconds).
const lastHour = 1794711600;
const hours = Array.from({ length: 25 }, (_, i) => lastHour - (24 - i) * 3600);
const goodLocation = {
  latitude: 10.3,
  longitude: 123.85,
  hourly: {
    time: hours,
    temperature_2m: hours.map(() => 30),
    relative_humidity_2m: hours.map(() => 70),
    // 0.5 mm every hour, except 2 mm in the latest hour.
    precipitation: hours.map((_, i) => (i === 24 ? 2 : 0.5)),
  },
};
// "Now" is 03:13 UTC, a little after the latest hour.
const now = new Date((lastHour + 13 * 60) * 1000);

test('Open-Meteo: a good location gives the latest hour and 24-hour rain', () => {
  const reading = parseOpenMeteoLocation(goodLocation, now);

  assert.equal(reading?.validAt.toISOString(), '2026-11-15T03:00:00.000Z');
  assert.equal(reading?.tempC, 30);
  assert.equal(reading?.humidityPct, 70);
  assert.equal(reading?.rain1hMm, 2);
  // 23 hours × 0.5 mm + 2 mm
  assert.equal(reading?.rain24hMm, 13.5);
});

test('Open-Meteo: hours in the future are ignored', () => {
  const earlier = new Date((lastHour - 30 * 60) * 1000); // 02:30 UTC
  const reading = parseOpenMeteoLocation(goodLocation, earlier);

  assert.equal(reading?.validAt.toISOString(), '2026-11-15T02:00:00.000Z');
});

test('Open-Meteo: missing values become null, not zero', () => {
  const gaps = {
    hourly: {
      ...goodLocation.hourly,
      temperature_2m: hours.map(() => null),
      precipitation: hours.map((_, i) => (i === 10 ? null : 0.5)),
    },
  };
  const reading = parseOpenMeteoLocation(gaps, now);

  assert.equal(reading?.tempC, null);
  assert.equal(reading?.rain1hMm, 0.5);
  assert.equal(reading?.rain24hMm, null);
});

test('Open-Meteo: broken locations are rejected', () => {
  const humidityTooHigh = {
    hourly: { ...goodLocation.hourly, relative_humidity_2m: hours.map(() => 250) },
  };
  const listsDiffer = {
    hourly: { ...goodLocation.hourly, precipitation: [0, 0, 0] },
  };

  assert.equal(parseOpenMeteoLocation(humidityTooHigh, now), null);
  assert.equal(parseOpenMeteoLocation(listsDiffer, now), null);
  assert.equal(parseOpenMeteoLocation({ error: true, reason: 'bad request' }, now), null);
});

// ---------- Heat index ----------

// Converts °F to °C, to compare with the published NWS chart (which is in °F).
function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

test('heat index matches the NWS chart', () => {
  // [air temperature °F, humidity %, heat index °F from the chart]
  const chart = [
    [90, 70, 105],
    [96, 50, 108],
    [86, 90, 105],
    [84, 60, 88],
    [100, 40, 109],
  ];
  for (const [tempF, humidity, expectedF] of chart) {
    // The `!` tells TypeScript "this is definitely not undefined".
    const actual = heatIndexC(fToC(tempF!), humidity!);
    const difference = Math.abs(actual - fToC(expectedF!));
    assert.ok(difference < 0.6, `${tempF} °F at ${humidity}%: got ${actual} °C`);
  }
});

test('heat index is close to the air temperature when it is mild', () => {
  const actual = heatIndexC(22, 50);
  assert.ok(Math.abs(actual - 22) < 1.5, `got ${actual}`);
});
