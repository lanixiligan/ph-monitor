// Reads the settings from the `.env` file at the project root and checks them.
// Every other server file gets its settings from `config`, never from
// `process.env` directly, so a missing or wrong value fails here, at startup.

import path from 'node:path';
import { z } from 'zod';

// `import.meta.dirname` is the folder this file lives in (server/src).
// `.env` is two folders up, at the project root.
const envFile = path.resolve(import.meta.dirname, '../../.env');

try {
  // Built into Node: copies each line of the file into `process.env`.
  process.loadEnvFile(envFile);
} catch {
  throw new Error(`Could not read ${envFile}. Copy .env.example to .env first.`);
}

// A zod "schema" describes what valid data looks like.
// `parse` checks real data against it and throws a clear error if it's wrong.
const schema = z.object({
  DATABASE_URL: z.string().startsWith('postgres://'),
  // .env values are always text; `coerce` turns "3001" into the number 3001.
  SERVER_PORT: z.coerce.number().int().positive(),
  // Optional: lets the link checker tell which streams are live right now.
  // `.optional()` means the line may be missing from .env. An empty line
  // (`YOUTUBE_API_KEY=`) is turned into "missing" first.
  YOUTUBE_API_KEY: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional()),
});

const env = schema.parse(process.env);

export const config = {
  databaseUrl: env.DATABASE_URL,
  serverPort: env.SERVER_PORT,
  /** null when no key is set; streams then show their latest video and "may be offline". */
  youtubeApiKey: env.YOUTUBE_API_KEY ?? null,
};
