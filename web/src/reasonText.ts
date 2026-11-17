// Turns a score reason from the server (a message key plus numbers) into a
// sentence in the current language. The server never writes sentences, so the
// wording lives in i18n/en.ts and i18n/fil.ts.

import type { ScoreReason } from '@ph-monitor/shared';
import { capitalise } from './format.ts';
import { fill, getI18n, lookup } from './i18n/index.ts';

/** The sentence for one reason. */
export function reasonText(reason: ScoreReason): string {
  const t = getI18n().t;
  const r = t.reasons;
  // `switch` picks the branch that matches `reason.key`. Inside each branch
  // TypeScript knows which fields that kind of reason has.
  switch (reason.key) {
    case 'quake': {
      const veryClose = reason.target === 'province' ? r.quakeInsideProvince : r.lessThanOneKmAway;
      const where = reason.isVeryClose ? veryClose : fill(r.kmAway, { km: reason.distanceKm });
      const depth =
        reason.depthKm === null ? r.depthUnknown : fill(r.depthKm, { km: reason.depthKm });
      const hours = reason.hoursAgo;
      const when =
        hours < 1
          ? r.lessThanAnHourAgo
          : hours === 1
            ? r.oneHourAgo
            : fill(r.hoursAgo, { hours });
      return fill(r.quake, { magnitude: reason.magnitude.toFixed(1), where, depth, when });
    }
    case 'moreQuakes':
      return fill(r.moreQuakes, { count: reason.count });
    case 'event': {
      const veryClose =
        reason.target === 'province' ? r.eventInOrBesideProvince : r.lessThanOneKmAway;
      const where = reason.isVeryClose ? veryClose : fill(r.kmAway, { km: reason.distanceKm });
      return fill(r.event, {
        level: capitalise(lookup(t.alertLevels, reason.alertLevel)),
        kind: lookup(t.kinds, reason.kind),
        where,
        ended: reason.hasEnded ? r.eventEnded : '',
      });
    }
    case 'noWeather':
      return reason.target === 'province' ? r.noWeatherProvince : r.noWeatherSpot;
    case 'noQuakeData':
      return r.noQuakeData;
    case 'noEventData':
      return r.noEventData;
    case 'rain': {
      const level = reason.level
        ? fill(r.rainLevel, { level: lookup(t.rainLevels, reason.level) })
        : '';
      return fill(r.rain, { rain1h: reason.rain1hMm, rain24h: reason.rain24hMm, level });
    }
    case 'heat': {
      const band = reason.band ? fill(r.heatBand, { band: lookup(t.heatBands, reason.band) }) : '';
      return fill(r.heat, { heat: reason.heatIndexC, band });
    }
    case 'calm':
      return r.calm;
  }
}
