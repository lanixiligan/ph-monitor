// Turns a score reason from the server (a message key plus numbers) into a
// sentence. The server never writes sentences, so the wording lives here.

import type { ScoreReason } from '@ph-monitor/shared';

/** 'orange' → 'Orange' */
function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The sentence for one reason. */
export function reasonText(reason: ScoreReason): string {
  // `switch` picks the branch that matches `reason.key`. Inside each branch
  // TypeScript knows which fields that kind of reason has.
  switch (reason.key) {
    case 'quake': {
      const veryClose = reason.target === 'province' ? 'inside the province' : 'less than 1 km away';
      const where = reason.isVeryClose ? veryClose : `${reason.distanceKm} km away`;
      const depth = reason.depthKm === null ? 'depth unknown' : `${reason.depthKm} km deep`;
      const hours = reason.hoursAgo;
      const when =
        hours < 1 ? 'less than an hour ago' : hours === 1 ? '1 hour ago' : `${hours} hours ago`;
      return `M${reason.magnitude.toFixed(1)} earthquake ${where} (${depth}), ${when}.`;
    }
    case 'moreQuakes':
      return `${reason.count} more smaller or older earthquakes nearby.`;
    case 'event': {
      const veryClose =
        reason.target === 'province' ? 'in or beside the province' : 'less than 1 km away';
      const where = reason.isVeryClose ? veryClose : `${reason.distanceKm} km away`;
      const ended = reason.hasEnded ? ' (now ended)' : '';
      return `GDACS ${capitalise(reason.alertLevel)} alert: ${reason.kind} ${where}${ended}.`;
    }
    case 'noWeather':
      return reason.target === 'province'
        ? 'No recent weather data for this province.'
        : 'No recent weather data for this spot.';
    case 'rain': {
      const level = reason.level ? ` (PAGASA ${reason.level} rainfall level)` : '';
      return `Rain: ${reason.rain1hMm} mm in the last hour, ${reason.rain24hMm} mm in the last 24 hours${level}.`;
    }
    case 'heat': {
      const band = reason.band ? ` (PAGASA "${reason.band}" band)` : '';
      return `Heat index ${reason.heatIndexC} °C${band}.`;
    }
    case 'calm':
      return 'No significant earthquake, weather or disaster event stress right now.';
  }
}
