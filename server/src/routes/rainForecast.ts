// API route for the rain forecast field (Typhoon view; display only, it never
// changes the score):
//   GET /api/rainforecast → the next 7 days of rain on the forecast grid, 3 hours at a time.

import { Router } from 'express';
import { getRainForecast } from '../rainForecast.ts';

export const rainForecastRouter = Router();

rainForecastRouter.get('/', async (_req, res) => {
  // New data comes every 12 hours, and the first frame moves on every 3 hours: 5 minutes is fine.
  res.set('Cache-Control', 'public, max-age=300');
  res.json(await getRainForecast());
});
