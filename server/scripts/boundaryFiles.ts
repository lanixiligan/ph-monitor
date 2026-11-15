// Shared by load-provinces.ts and load-places.ts: fetches a boundary file
// from github.com/faeldon/philippines-json-maps, keeping a copy in data/
// (git-ignored) so a second run doesn't download it again.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL =
  'https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/latest/geojson';

const dataDir = path.resolve(import.meta.dirname, '../../data/boundaries');

/**
 * Returns the file's text, downloading it first if we don't have it yet.
 * @param folder where the file lives in the repository, e.g. 'regions/medres'
 */
export async function getBoundaryFile(folder: string, fileName: string): Promise<string> {
  const localPath = path.join(dataDir, fileName);

  try {
    return await readFile(localPath, 'utf8');
  } catch {
    // Not downloaded yet: fall through and fetch it.
  }

  const response = await fetch(`${BASE_URL}/${folder}/${fileName}`);
  if (!response.ok) {
    throw new Error(`Download failed for ${fileName}: HTTP ${response.status}`);
  }
  const text = await response.text();
  await mkdir(dataDir, { recursive: true });
  await writeFile(localPath, text);
  return text;
}
