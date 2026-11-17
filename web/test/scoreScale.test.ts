import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandColors, bandFor, SCORE_BANDS, scoreText } from '../src/scoreScale.ts';
import { en } from '../src/i18n/en.ts';

// How bright a '#rrggbb' colour looks, 0 (black) to 1 (white): the WCAG formula.
function luminance(hex: string): number {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

test('bandFor puts each score in the right band', () => {
  assert.equal(bandFor(0).id, 'calm');
  assert.equal(bandFor(19).id, 'calm');
  assert.equal(bandFor(20).id, 'low');
  assert.equal(bandFor(79).id, 'high');
  assert.equal(bandFor(100).id, 'severe');
});

test('light theme: each band is darker than the one before', () => {
  const values = SCORE_BANDS.map((band) => luminance(bandColors(band, 'light').color));
  for (let i = 1; i < values.length; i++) assert.ok(values[i]! < values[i - 1]!, `band ${i}`);
});

test('dark theme: each band is brighter than the one before', () => {
  const values = SCORE_BANDS.map((band) => luminance(bandColors(band, 'dark').color));
  for (let i = 1; i < values.length; i++) assert.ok(values[i]! > values[i - 1]!, `band ${i}`);
});

test('the text on every band is readable (contrast at least 4.5:1)', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const band of SCORE_BANDS) {
      const { color, ink } = bandColors(band, theme);
      assert.ok(contrast(color, ink) >= 4.5, `${theme} ${band.id}: ${contrast(color, ink).toFixed(2)}`);
    }
  }
});

test('the lowest band says what we know ("nothing detected"), not that all is calm', () => {
  assert.equal(en.bands.calm, 'Nothing detected');
});

test('a score with missing data is written as "at least N"', () => {
  assert.equal(scoreText(12, false), '12');
  assert.equal(scoreText(12, true), 'at least 12');
  assert.equal(scoreText(null, false), 'no score yet');
});

test('modelled rain is never worded as a PAGASA warning', () => {
  assert.match(en.reasons.rainLevel, /not a PAGASA warning/);
});
