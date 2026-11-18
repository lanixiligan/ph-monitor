// Starts the web server (the API the map talks to) and the job timers.
// Run with: npm run dev   (restarts by itself when you save a file)

import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { APP_NAME } from '@ph-monitor/shared';
import { config } from './config.ts';
import { pool } from './db.ts';
import { startScheduler } from './jobs/scheduler.ts';
import { conditionsRouter } from './routes/conditions.ts';
import { hazardsRouter } from './routes/hazards.ts';
import { placesRouter } from './routes/places.ts';
import { pointRouter } from './routes/point.ts';
import { provincesRouter } from './routes/provinces.ts';

const app = express();

// A quick "is it alive?" check that also proves the database answers.
app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, app: APP_NAME, time: new Date().toISOString() });
});

app.use('/api/provinces', provincesRouter);
app.use('/api/point', pointRouter);
app.use('/api/places', placesRouter);
// Fixed hazard maps (Project NOAH): the loaded layers and the map tiles
app.use('/api/hazards', hazardsRouter);
// Phase 2: /api/events, /api/storms, /api/news, /api/streams, /api/bulletins
app.use('/api', conditionsRouter);

// Any error thrown in a route above ends up here. Having four parameters is
// how Express recognises an error handler, so `_next` must stay even if unused.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Request failed:', error);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

// 127.0.0.1 = only this computer can connect.
// Express also calls this function with an error when it cannot start, most
// often because another copy is already using the port. Then we stop, so a
// second copy never runs the fetch jobs a second time.
// `error?: Error` means the argument is optional: it is only there on failure.
app.listen(config.serverPort, '127.0.0.1', (error?: Error) => {
  if (error) {
    console.error(`Could not start on port ${config.serverPort}: ${error.message}`);
    console.error('Is the server already running in another terminal?');
    process.exit(1);
  }
  console.log(`${APP_NAME} server: http://localhost:${config.serverPort}/api/health`);
  startScheduler();
});
