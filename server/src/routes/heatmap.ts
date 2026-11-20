// API route for the heat map (display only; it never changes the score):
//   GET /api/heatmap?model=ecmwf_ifs → each town's and province's heat index
//   for the current hour from that model. No model = the default (ECMWF).
//   GET /api/heatmap?model=pagasa → PAGASA's own forecast.
//   GET /api/heatmap?model=average → the average of all the models.
//   `&at=` is one of the time bar's hours (ISO time); no `at` = the default hour.
//   An `at` that is not a bar hour gives 400.

import { Router } from 'express';
import { DEFAULT_HEAT_MODEL, HEAT_VIEWS, defaultBarTime, isBarTime } from '@ph-monitor/shared';
import { getHeatMap } from '../heatMap.ts';

export const heatmapRouter = Router();

/** 5 minutes, or the seconds left in this hour if fewer (at least 1). */
export function cacheSeconds(now: Date): number {
  const leftInHour = 3600 - Math.floor(now.getTime() / 1000) % 3600;
  return Math.max(1, Math.min(300, leftInHour));
}

heatmapRouter.get('/', async (req, res) => {
  const asked = req.query.model;
  // Only a view in the list is allowed; `find` gives undefined when none matches.
  const model = asked === undefined ? DEFAULT_HEAT_MODEL : HEAT_VIEWS.find((view) => view === asked);
  if (model === undefined) {
    res.status(400).json({ error: 'unknown model', models: HEAT_VIEWS });
    return;
  }
  const now = new Date();
  // No `at` = the default bar hour. Otherwise it must parse and be one of the bar's hours.
  let at = defaultBarTime(now);
  if (req.query.at !== undefined) {
    // `typeof` check: a repeated `at=` would be a list, which is not a time.
    const asked = typeof req.query.at === 'string' ? new Date(req.query.at) : new Date(NaN);
    if (Number.isNaN(asked.getTime()) || !isBarTime(asked, now)) {
      res.status(400).json({ error: 'bad time' });
      return;
    }
    at = asked;
  }
  // The data changes every 12 hours and with the clock hour: keep it 5 minutes,
  // but never past the end of this hour, so a new hour is never shown old.
  res.set('Cache-Control', `public, max-age=${cacheSeconds(now)}`);
  res.json(await getHeatMap(model, at, now));
});
