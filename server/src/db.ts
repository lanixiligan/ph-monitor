// The database connection, shared by the whole server.

import pg from 'pg';
import { config } from './config.ts';

// PostgreSQL's BIGINT (used for province codes and for count(*)) arrives as
// text by default, because it can hold numbers too big for JavaScript.
// Ours are small, so turn them into normal numbers. 20 is BIGINT's type id.
pg.types.setTypeParser(20, Number);

// A "pool" keeps a few connections open and hands them out as needed.
// Use it like: `const result = await pool.query('SELECT ...')`.
export const pool = new pg.Pool({ connectionString: config.databaseUrl });

// If the database goes away (for example `npm run db:down`), the pool reports
// it here. Without this listener Node treats it as a crash and stops the
// server; with it we log the problem and carry on until the database is back.
pool.on('error', (error) => {
  console.error('Database connection error:', error.message);
});
