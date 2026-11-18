// API route for the heat map (display only; it never changes the score):
//   GET /api/heatmap?model=ecmwf_ifs → each town's and province's heat index
//   for the current hour from that model. No model = the default (ECMWF).

import { Router } from 'express';
import { DEFAULT_HEAT_MODEL, HEAT_MODELS } from '@ph-monitor/shared';
import { getHeatMap } from '../heatMap.ts';

export const heatmapRouter = Router();

/** 5 minutes, or the seconds left in this hour if fewer (at least 1). */
export function cacheSeconds(now: Date): number {
  const leftInHour = 3600 - Math.floor(now.getTime() / 1000) % 3600;
  return Math.max(1, Math.min(300, leftInHour));
}

heatmapRouter.get('/', async (req, res) => {
  const asked = req.query.model;
  // Only a model in the list is allowed; `?.id` is undefined when none matches.
  const model = asked === undefined ? DEFAULT_HEAT_MODEL : HEAT_MODELS.find((entry) => entry.id === asked)?.id;
  if (model === undefined) {
    res.status(400).json({ error: 'unknown model', models: HEAT_MODELS.map((entry) => entry.id) });
    return;
  }
  // The data changes every 12 hours and with the clock hour: keep it 5 minutes,
  // but never past the end of this hour, so a new hour is never shown old.
  res.set('Cache-Control', `public, max-age=${cacheSeconds(new Date())}`);
  res.json(await getHeatMap(model));
});
