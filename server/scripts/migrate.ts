// Creates the database tables by running db/schema.sql.
// Run with: npm run migrate
// Safe to run more than once (see the note at the top of schema.sql).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../src/db.ts';

const schemaFile = path.resolve(import.meta.dirname, '../db/schema.sql');

try {
  const sql = await readFile(schemaFile, 'utf8');
  await pool.query(sql);

  // List our tables so you can see what exists.
  // `<{ tablename: string }>` tells TypeScript the shape of each returned row.
  const result = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys'
     ORDER BY tablename`,
  );

  console.log(`Schema applied. ${result.rows.length} tables:`);
  for (const row of result.rows) {
    console.log(`  ${row.tablename}`);
  }
} catch (error) {
  console.error('Migration failed:', error);
  // A non-zero exit code tells npm (and you) that the command failed.
  process.exitCode = 1;
} finally {
  // Close the connections, otherwise the script would never exit.
  await pool.end();
}
