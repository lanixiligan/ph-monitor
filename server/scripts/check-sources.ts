// Checks every news feed and live stream link once and prints a table.
// Run with: npm run check:sources

import { pool } from '../src/db.ts';
import { checkSources } from '../src/jobs/checkSources.ts';

try {
  await checkSources();

  const { rows } = await pool.query(
    `SELECT id, kind, status, is_stale, is_live, video_title, video_published_at, note
     FROM sources ORDER BY kind, id`,
  );

  // Pads text with spaces so the columns line up.
  const pad = (text: string, width: number) => text.padEnd(width);
  console.log('');
  console.log(`${pad('SOURCE', 24)}${pad('KIND', 8)}${pad('STATUS', 16)}${pad('SHOWS', 8)}DETAILS`);
  for (const row of rows) {
    // What the page will label a stream: LIVE, or Latest (the channel's newest video).
    const usable = row.status === 'ok' || row.status === 'not-live';
    const shows = row.kind !== 'stream' || !usable ? '' : row.is_live === true ? 'LIVE' : 'Latest';
    const video = row.video_title
      ? `"${String(row.video_title).slice(0, 60)}" (${row.video_published_at?.toISOString().slice(0, 16).replace('T', ' ')} UTC)`
      : '';
    const details = [row.is_stale ? 'STALE' : '', video, row.note ?? ''].filter(Boolean).join(' | ');
    console.log(`${pad(row.id, 24)}${pad(row.kind, 8)}${pad(row.status, 16)}${pad(shows, 8)}${details}`);
  }

  // 'not-live' is fine: the link works and the page shows the latest video.
  const broken = rows.filter((row) => row.status === 'dead' || row.status === 'not-embeddable').length;
  const stale = rows.filter((row) => row.is_stale).length;
  const live = rows.filter((row) => row.is_live === true).length;
  console.log('');
  console.log(
    `${rows.length} sources: ${rows.length - broken} working (${live} streams live now), ${broken} broken, ${stale} stale.`,
  );
} catch (error) {
  console.error('Source check failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
