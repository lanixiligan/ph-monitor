// Tests for the place search rule (src/placeSearch.ts). Run with: npm test
// Pure functions only: the list of places is passed in.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchPlaces } from '../src/placeSearch.ts';
import type { SearchPlace } from '../src/placeSearch.ts';

let nextPsgc = 1;
function place(name: string, provinceName: string | null, kind: SearchPlace['kind'] = 'municipality'): SearchPlace {
  return { psgc: nextPsgc++, name, kind, provinceName, lat: 10, lon: 123 };
}

const places: SearchPlace[] = [
  place('Cebu', null, 'province'),
  place('City of Cebu', 'Cebu', 'city'),
  place('Cebuano Springs', 'Bohol'),
  place('San Jose', 'Batangas'),
  place('San Jose', 'Antique'),
  place('San Jose City', 'Nueva Ecija', 'city'),
  place('San Jose De Buan', 'Samar'),
  place('City of Parañaque', 'NCR, Fourth District', 'city'),
  place('Peñablanca', 'Cagayan'),
  place('Batangas', null, 'province'),
  place('Santa Cruz', 'Laguna'),
];

// What a reader would see for each match: "name (province)".
const shown = (query: string, limit?: number) =>
  searchPlaces(places, query, limit).map((match) => `${match.name} (${match.provinceName ?? 'province'})`);

test('a query shorter than 2 letters, or with no letters, finds nothing', () => {
  assert.deepEqual(shown(''), []);
  assert.deepEqual(shown('c'), []);
  assert.deepEqual(shown('  ,  '), []);
});

test('an exact name comes first (city, then province), then names that only start with it', () => {
  assert.deepEqual(shown('cebu'), ['City of Cebu (Cebu)', 'Cebu (province)', 'Cebuano Springs (Bohol)']);
});

test('upper case, extra spaces and word order do not matter: "CEBU  city" finds "City of Cebu"', () => {
  assert.deepEqual(shown('  CEBU  city '), ['City of Cebu (Cebu)']);
});

test('letters typed without accents still match: "paranaque", "penablanca"', () => {
  assert.deepEqual(shown('paranaque'), ['City of Parañaque (NCR, Fourth District)']);
  assert.deepEqual(shown('Penablanca'), ['Peñablanca (Cagayan)']);
});

test('each word may be the start of a word: "san jo" finds every San Jose, exact names before longer ones', () => {
  assert.deepEqual(shown('san jose'), [
    'San Jose City (Nueva Ecija)',
    'San Jose (Antique)',
    'San Jose (Batangas)',
    'San Jose De Buan (Samar)',
  ]);
  assert.equal(shown('san jo').length, 4);
});

test('a province name narrows it down: "san jose batangas"', () => {
  assert.deepEqual(shown('san jose batangas'), ['San Jose (Batangas)']);
  // But a province name alone does not list every town in it.
  assert.deepEqual(shown('batangas'), ['Batangas (province)']);
});

test('the letters must start a word: "ruz" does not find Santa Cruz', () => {
  assert.deepEqual(shown('ruz'), []);
  assert.deepEqual(shown('cruz'), ['Santa Cruz (Laguna)']);
});

test('no more matches than the limit', () => {
  assert.equal(shown('san', 2).length, 2);
});
