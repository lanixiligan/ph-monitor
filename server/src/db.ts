// The database connection, shared by the whole server.

import pg from 'pg';
import { config } from './config.ts';

// A "pool" keeps a few connections open and hands them out as needed.
// Use it like: `const result = await pool.query('SELECT ...')`.
export const pool = new pg.Pool({ connectionString: config.databaseUrl });
