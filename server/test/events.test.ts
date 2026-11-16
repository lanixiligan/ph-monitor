// Checks that the GDACS and EONET parsers accept good records and reject bad ones.
// Run with: npm test
// No network or database is used. The RSS and EONET samples in fixtures/events/
// are trimmed copies of the real feeds. The API sample follows GDACS's documented
// format (the API was not answering when it was written), using the same event
// as the RSS sample.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseEonet } from '../src/fetchers/eonet.ts';
import { gdacsKind, toAlertLevel } from '../src/fetchers/eventRecord.ts';
import { parseGdacsApi, parseGdacsRss } from '../src/fetchers/gdacs.ts';

// Reads a sample file next to this test. `import.meta.url` is this file's own location.
function sample(name: string): string {
  return readFileSync(new URL(`./fixtures/events/${name}`, import.meta.url), 'utf8');
}

const rssText = sample('gdacs-rss.xml');
const apiJson: { features: Record<string, unknown>[] } = JSON.parse(sample('gdacs-api.json'));
const eonetJson: { events: Record<string, unknown>[] } = JSON.parse(sample('eonet.json'));

test('GDACS RSS: a Philippines item is accepted and converted', () => {
  const result = parseGdacsRss(rssText);
  const quake = result.events.find((e) => e.id === 'gdacs:EQ:1577487');

  assert.equal(result.skipped, 0);
  assert.equal(quake?.source, 'gdacs');
  assert.equal(quake?.kind, 'earthquake');
  assert.equal(quake?.alertLevel, 'green');
  assert.equal(quake?.startedAt.toISOString(), '2026-11-15T13:41:35.000Z');
  assert.equal(quake?.endedAt, null); // iscurrent is true
  assert.equal(quake?.url, 'https://www.gdacs.org/report.aspx?eventtype=EQ&eventid=1577487');
  assert.deepEqual(quake?.geometry, { type: 'Point', coordinates: [126.2, 9.7595] });
});

test('GDACS RSS: only Philippines items are kept', () => {
  const result = parseGdacsRss(rssText);
  const ids = result.events.map((e) => e.id).sort();

  // The sample also has a cyclone near the Cook Islands, which must be dropped.
  // The drought is kept because its country list names the Philippines,
  // even though its map point is in Cambodia.
  assert.deepEqual(ids, ['gdacs:DR:1018545', 'gdacs:EQ:1577487']);
  const drought = result.events.find((e) => e.kind === 'drought');
  assert.equal(drought?.endedAt?.toISOString(), '2026-11-13T00:00:00.000Z');
});

test('GDACS RSS: an item inside the box is kept even without a country', () => {
  const noCountry = rssText.replace('<gdacs:country>Philippines</gdacs:country>', '');
  const ids = parseGdacsRss(noCountry).events.map((e) => e.id);

  assert.ok(ids.includes('gdacs:EQ:1577487'));
});

test('GDACS RSS: broken items are skipped, good ones are kept', () => {
  const noPoint = rssText.replace(/<geo:lat>[^<]*<\/geo:lat>/, '').replace(/<georss:point>[^<]*<\/georss:point>/, '');
  const badDate = rssText.replace(
    '<gdacs:fromdate>Sun, 15 Nov 2026 13:41:35 GMT</gdacs:fromdate>',
    '<gdacs:fromdate>not a date</gdacs:fromdate>',
  );

  const first = parseGdacsRss(noPoint);
  assert.equal(first.skipped, 1);
  assert.ok(first.events.some((e) => e.id === 'gdacs:DR:1018545'));
  assert.ok(!first.events.some((e) => e.id === 'gdacs:EQ:1577487'));

  const second = parseGdacsRss(badDate);
  assert.equal(second.skipped, 1);
  assert.ok(second.events.some((e) => e.id === 'gdacs:DR:1018545'));
});

test('GDACS RSS: text that is not a feed throws', () => {
  assert.throws(() => parseGdacsRss('<html>Timeout expired</html>'));
});

test('GDACS API: a good feature is accepted and converted', () => {
  const result = parseGdacsApi(apiJson);
  const quake = result.events[0];

  assert.equal(result.skipped, 0);
  assert.equal(result.events.length, 1);
  assert.equal(quake?.id, 'gdacs:EQ:1577487');
  assert.equal(quake?.kind, 'earthquake');
  assert.equal(quake?.alertLevel, 'green');
  assert.equal(quake?.startedAt.toISOString(), '2026-11-15T13:41:35.000Z');
  assert.equal(quake?.endedAt, null);
  assert.equal(quake?.url, 'https://www.gdacs.org/report.aspx?eventtype=EQ&eventid=1577487');
  assert.deepEqual(quake?.geometry, { type: 'Point', coordinates: [126.2, 9.7595] });
});

test('GDACS API: a finished event gets an end date', () => {
  const feature = apiJson.features[0] as { properties: Record<string, unknown> };
  const finished = {
    features: [
      {
        ...feature,
        properties: { ...feature.properties, iscurrent: 'false', todate: '2026-11-16T00:00:00' },
      },
    ],
  };

  assert.equal(parseGdacsApi(finished).events[0]?.endedAt?.toISOString(), '2026-11-16T00:00:00.000Z');
});

test('GDACS API: broken features are skipped, good ones are kept', () => {
  const feature = apiJson.features[0] as { properties: Record<string, unknown> };
  const badLatitude = { ...feature, geometry: { type: 'Point', coordinates: [126.2, 95] } };
  const noType = { ...feature, properties: { ...feature.properties, eventtype: undefined } };
  const badDate = { ...feature, properties: { ...feature.properties, fromdate: 'nope' } };

  const result = parseGdacsApi({ features: [badLatitude, feature, noType, badDate] });

  assert.equal(result.skipped, 3);
  assert.equal(result.events.length, 1);
});

test('GDACS: kind and alert level mapping', () => {
  assert.equal(gdacsKind('TC'), 'typhoon');
  assert.equal(gdacsKind('EQ'), 'earthquake');
  assert.equal(gdacsKind('FL'), 'flood');
  assert.equal(gdacsKind('VO'), 'volcano');
  assert.equal(gdacsKind('WF'), 'wildfire');
  assert.equal(gdacsKind('DR'), 'drought');
  assert.equal(gdacsKind('XX'), 'other');

  assert.equal(toAlertLevel('Green'), 'green');
  assert.equal(toAlertLevel('Orange'), 'orange');
  assert.equal(toAlertLevel('Red'), 'red');
  assert.equal(toAlertLevel('Purple'), null);
  assert.equal(toAlertLevel(undefined), null);
});

test('EONET: an event not from GDACS is accepted; the newest position is used', () => {
  const result = parseEonet(eonetJson);
  const storm = result.events[0];

  assert.equal(result.skipped, 0);
  assert.equal(result.events.length, 1);
  assert.equal(storm?.id, 'eonet:EONET_25339');
  assert.equal(storm?.source, 'eonet');
  assert.equal(storm?.kind, 'typhoon');
  assert.equal(storm?.alertLevel, null);
  assert.equal(storm?.title, 'Super Typhoon Champi');
  assert.equal(storm?.startedAt.toISOString(), '2026-10-15T12:00:00.000Z');
  assert.equal(storm?.endedAt?.toISOString(), '2026-10-30T00:00:00.000Z');
  assert.equal(storm?.geometry.type, 'Point');
  // The last geometry in the sample is the newest one.
  const geometries = (eonetJson.events[1] as { geometry: { coordinates: number[] }[] }).geometry;
  assert.deepEqual(storm?.geometry.coordinates, geometries[geometries.length - 1]?.coordinates);
});

test('EONET: events that come from GDACS are skipped and counted', () => {
  const result = parseEonet(eonetJson);

  assert.equal(result.fromGdacs, 1);
  assert.ok(!result.events.some((e) => e.title.startsWith('Flood in Philippines')));
});

test('EONET: an area is kept as a Polygon and category ids are mapped', () => {
  const flood = eonetJson.events[0] as { sources: unknown[] };
  const own = { ...flood, id: 'EONET_1', sources: [{ id: 'PDC', url: 'https://example.org' }] };
  const result = parseEonet({ events: [own] });

  assert.equal(result.events[0]?.kind, 'flood');
  assert.equal(result.events[0]?.geometry.type, 'Polygon');

  const other = { ...own, id: 'EONET_2', categories: [{ id: 'dustHaze' }] };
  assert.equal(parseEonet({ events: [other] }).events[0]?.kind, 'other');
  const volcano = { ...own, id: 'EONET_3', categories: [{ id: 'volcanoes' }] };
  assert.equal(parseEonet({ events: [volcano] }).events[0]?.kind, 'volcano');
});

test('EONET: broken events are skipped, good ones are kept', () => {
  const storm = eonetJson.events[1] as Record<string, unknown>;
  const noGeometry = { ...storm, id: 'bad1', geometry: [] };
  const badPoint = {
    ...storm,
    id: 'bad2',
    geometry: [{ type: 'Point', date: '2026-10-15T12:00:00Z', coordinates: [157.4, 95] }],
  };
  const badDate = {
    ...storm,
    id: 'bad3',
    geometry: [{ type: 'Point', date: 'nope', coordinates: [120, 10] }],
  };
  const noTitle = { ...storm, id: 'bad4', title: undefined };

  const result = parseEonet({ events: [noGeometry, badPoint, storm, badDate, noTitle] });

  assert.equal(result.skipped, 4);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.id, 'eonet:EONET_25339');
});
