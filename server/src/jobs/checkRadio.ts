// Job: check every saved radio stream (open, wait for the first audio bytes,
// hang up), 6 at a time, and record the result in radio_stations.
// Runs every 6 hours (due.ts). Run by hand with: npm run check:radio
// About 670 stations x ~1 KB each: well under 1 MB of audio a run.

import { DEAD_AFTER_HOURS } from '../checker/checkStream.ts';
import { judgeRadio, nextFailingSince, probeRadio } from '../checker/checkRadio.ts';
import type { RadioVerdict } from '../checker/checkRadio.ts';
import { pool } from '../db.ts';
import { inBatches } from '../inBatches.ts';
import { RADIO_NEWS } from '../sources.ts';

const AT_A_TIME = 6;
const HOUR_MS = 60 * 60 * 1000;

type Row = { id: string; name: string; url: string; failing_since: Date | null };

export async function checkRadio(): Promise<void> {
  const stations = await pool.query<Row>('SELECT id, name, url, failing_since FROM radio_stations ORDER BY id');
  const started = Date.now();
  const verdicts = new Map<string, RadioVerdict>();
  const counts = { ok: 0, failed: 0, unchecked: 0, hidden: 0 };

  await inBatches(stations.rows, AT_A_TIME, async (station) => {
    const verdict = judgeRadio(await probeRadio(station.url));
    const now = new Date();
    const failingSince = nextFailingSince(verdict, station.failing_since, now);
    verdicts.set(station.id, verdict);
    counts[verdict.status] += 1;
    if (failingSince && now.getTime() - failingSince.getTime() >= DEAD_AFTER_HOURS * HOUR_MS) counts.hidden += 1;
    // The station may have left the list while we checked: then nothing is updated.
    await pool.query(
      `UPDATE radio_stations SET last_checked_at = now(), failing_since = $2, check_note = $5,
         last_ok_at = CASE WHEN $3 THEN now() ELSE last_ok_at END
       WHERE id = $1 AND url = $4`,
      [station.id, failingSince, verdict.status === 'ok', station.url, verdict.note],
    );
  });

  await pool.query(
    `INSERT INTO fetch_runs (source, last_ok_at) VALUES ('radio-check', now())
     ON CONFLICT (source) DO UPDATE SET last_ok_at = EXCLUDED.last_ok_at`,
  );

  for (const pick of RADIO_NEWS) {
    const verdict = verdicts.get(pick.stationId);
    const text = verdict ? `${verdict.status}${verdict.note ? ` (${verdict.note})` : ''}` : 'not in the station list';
    console.log(`Radio check: ${pick.label.padEnd(30)} ${text}`);
  }
  const minutes = ((Date.now() - started) / 60_000).toFixed(1);
  console.log(
    `Radio check: ${stations.rows.length} stations in ${minutes} min: ${counts.ok} ok, ${counts.failed} failing, ` +
      `${counts.unchecked} could not be checked (old Shoutcast or refused us), ${counts.hidden} hidden (failing for ${DEAD_AFTER_HOURS} h).`,
  );
}
