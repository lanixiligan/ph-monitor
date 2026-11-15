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
