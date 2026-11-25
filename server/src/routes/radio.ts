// API route for the radio panel (display only; radio never changes the score):
//   GET /api/radio → the stations the page may play: the News & Emergency group
//                    first (in the order of RADIO_NEWS in sources.ts), then the rest
//                    by Radio Browser votes. Stations whose stream has failed our
//                    check for a day or more are left out.

import { Router } from 'express';
import type { RadioStation } from '@ph-monitor/shared';
import { DEAD_AFTER_HOURS } from '../checker/checkStream.ts';
import { pool } from '../db.ts';
import { RADIO_NEWS } from '../sources.ts';
import type { RadioNewsStation } from '../sources.ts';

export const radioRouter = Router();

type StationRow = {
  id: string;
  name: string;
  state: string | null;
  codec: string | null;
  bitrate: number | null;
  url: string;
};

/** Puts the curated group first, with its own labels; the rows arrive sorted by votes. Pure. */
export function orderStations(rows: StationRow[], news: RadioNewsStation[]): RadioStation[] {
  const toStation = (row: StationRow, label: string | null): RadioStation => ({
    id: row.id,
    name: label ?? row.name,
    place: row.state,
    codec: row.codec,
    bitrate: row.bitrate,
    url: row.url,
    isNews: label !== null,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const first = news.flatMap((pick) => {
    const row = byId.get(pick.stationId);
    // `flatMap` with [] drops a curated station that is missing or hidden.
    return row ? [toStation(row, pick.label)] : [];
  });
  const newsIds = new Set(news.map((pick) => pick.stationId));
  const rest = rows.filter((row) => !newsIds.has(row.id)).map((row) => toStation(row, null));
  return [...first, ...rest];
}

/** Every station that has not failed our check for DEAD_AFTER_HOURS or more. */
export async function readRadioStations(): Promise<RadioStation[]> {
  const result = await pool.query<StationRow>(
    `SELECT id, name, state, codec, bitrate, url FROM radio_stations
     WHERE failing_since IS NULL OR failing_since > now() - make_interval(hours => $1)
     ORDER BY votes DESC, name`,
    [DEAD_AFTER_HOURS],
  );
  return orderStations(result.rows, RADIO_NEWS);
}

radioRouter.get('/', async (_req, res) => {
  // The list changes once a day and the check every 6 hours: 5 minutes is fine.
  res.set('Cache-Control', 'public, max-age=300');
  res.json(await readRadioStations());
});
