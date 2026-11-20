// Reads one PAGASA iHeatMAP GeoTIFF (one band of heat index, Web Mercator) and finds
// the cell for a longitude and latitude. Display only: the score never reads this.

import { fromArrayBuffer } from 'geotiff';

/** The shape of the grid. Web Mercator metres; the origin is the top-left corner. */
export type GridInfo = { width: number; height: number; originX: number; originY: number; pixelSize: number };

/** The grid plus its numbers, row by row: values[row * width + col]. */
export type Grid = GridInfo & { values: Float32Array };

const EARTH_RADIUS = 6378137; // metres, the sphere Web Mercator uses
const WEB_MERCATOR = 3857;

/** Longitude and latitude (degrees) → Web Mercator metres. */
export function lonLatToMercator(lon: number, lat: number): { x: number; y: number } {
  const x = (EARTH_RADIUS * lon * Math.PI) / 180;
  const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return { x, y };
}

/** Web Mercator metres → longitude and latitude (degrees). */
export function mercatorToLonLat(x: number, y: number): { lon: number; lat: number } {
  const lon = (x / EARTH_RADIUS) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI);
  return { lon, lat };
}

/** Reads the file. Throws unless it is one band of 32-bit floats in EPSG:3857 with square pixels. */
export async function readGrid(bytes: ArrayBuffer): Promise<Grid> {
  const tiff = await fromArrayBuffer(bytes);
  const image = await tiff.getImage();
  const keys = image.getGeoKeys();
  if (keys.ProjectedCSTypeGeoKey !== WEB_MERCATOR) throw new Error('PAGASA file is not in EPSG:3857');
  if (image.getSamplesPerPixel() !== 1) throw new Error('PAGASA file does not have exactly one band');
  // Sample format 3 = floating point numbers.
  const format = image.getSampleFormat(0);
  const bits = image.getBitsPerSample(0);
  if (format !== 3 || bits !== 32) throw new Error('PAGASA file is not 32-bit floats');

  // `?? NaN` = use NaN when the value is missing (`undefined`), which then fails the check.
  const [resX = NaN, resY = NaN] = image.getResolution();
  if (!Number.isFinite(resX) || !Number.isFinite(resY) || Math.abs(Math.abs(resX) - Math.abs(resY)) > 1e-6) {
    throw new Error('PAGASA file does not have square pixels');
  }
  const [originX = NaN, originY = NaN] = image.getOrigin();
  const width = image.getWidth();
  const height = image.getHeight();

  // `interleave: true` = one flat list for the single band.
  const raster = await image.readRasters({ interleave: true });
  if (!(raster instanceof Float32Array) || raster.length !== width * height) {
    throw new Error('PAGASA file did not decode to 32-bit floats');
  }
  return { width, height, originX, originY, pixelSize: Math.abs(resX), values: raster };
}

/** The cell index (row * width + col) holding this spot, or null outside the grid. */
export function cellAt(grid: GridInfo, lon: number, lat: number): number | null {
  const { x, y } = lonLatToMercator(lon, lat);
  const col = Math.floor((x - grid.originX) / grid.pixelSize);
  const row = Math.floor((grid.originY - y) / grid.pixelSize);
  // NaN (a missing spot, or a latitude past the pole) is not a cell either.
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return null;
  return row * grid.width + col;
}

/** A heat index only when it is a real number above 0 and at most 70; else null (no data). */
export function cleanValue(value: number): number | null {
  return Number.isFinite(value) && value > 0 && value <= 70 ? value : null;
}

/** True when two grids line up exactly (size, and origin and pixel size within 1 cm). */
export function sameGrid(a: GridInfo, b: GridInfo): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    Math.abs(a.originX - b.originX) <= 0.01 &&
    Math.abs(a.originY - b.originY) <= 0.01 &&
    Math.abs(a.pixelSize - b.pixelSize) <= 0.01
  );
}
