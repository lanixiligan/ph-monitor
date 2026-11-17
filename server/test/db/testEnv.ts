// Points DATABASE_URL at the test database (the name in .env plus "_test").
// testDb.ts imports this file before src/db.ts, so the pool never connects
// to your real data. Nothing here waits for anything (no `await`): a file
// that waits lets the files imported after it start early, and src/db.ts
// would then read the real address.

import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '../../..');
// Values already set in the environment win over the file.
process.loadEnvFile(path.join(root, '.env'));

/** The address of the main database; used only to create the test one. */
export const mainUrl = process.env.DATABASE_URL ?? '';
const url = new URL(mainUrl);
export const testName = `${url.pathname.slice(1)}_test`;
url.pathname = `/${testName}`;
process.env.DATABASE_URL = url.toString();
