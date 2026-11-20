// The rain forecast field on the map (Typhoon view): one frame of the next 7
// days, drawn as an image over the sea and land (rainField.ts), under the town
// outlines, the PAR outline and the storm tracks. Display only: it never
// changes the score.
// `useRainField` is a React "hook": it runs along with ProvinceMap.

import type * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
// `RefObject` is the type of a ref: a box holding a value that survives re-renders.
import type { RefObject } from 'react';
import type { RainGrid } from '@ph-monitor/shared';
import { readPalette } from './palette.ts';
import { hexToRgb } from './rainColors.ts';
import type { Rgb } from './rainColors.ts';
import { imageCorners, renderField } from './rainField.ts';
import type { FieldColors } from './rainField.ts';
import type { Theme } from './theme/index.ts';

/** The rain layer, for ProvinceMap. */
export const RAIN_LAYER = 'rain-field';

/** Pixels per grid step: 30 makes a 450 × 450 image for the 16 × 16 grid, smooth enough. */
const PIXELS_PER_STEP = 30;

/** What the map draws: one frame on its grid. */
export type RainOnMap = { grid: RainGrid; mm: (number | null)[] };

/** The theme's colours as numbers. A colour that can't be read becomes grey (never missing). */
function fieldColors(): FieldColors {
  const palette = readPalette();
  const grey: Rgb = [128, 128, 128];
  return {
    bands: palette.rain.map((color) => hexToRgb(color) ?? grey),
    noData: hexToRgb(palette.noData) ?? grey,
  };
}

/** The frame as a PNG picture (a data: address the map can load). */
function frameImage(frame: RainOnMap): string {
  const width = PIXELS_PER_STEP * (frame.grid.cols - 1);
  const height = PIXELS_PER_STEP * (frame.grid.rows - 1);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) return canvas.toDataURL();
  const pixels = renderField(frame.mm, frame.grid, width, height, fieldColors());
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Shows `frame` (null = nothing to show, or the layer is off). The image is
 * redrawn when the frame or the theme changes; the map is remade on a theme
 * change, so the source is added again then.
 */
export function useRainField(
  mapRef: RefObject<maplibregl.Map | null>,
  ready: boolean,
  frame: RainOnMap | null,
  theme: Theme,
) {
  // The last picture shown, so a frame that comes back does not have to be drawn twice.
  const cacheRef = useRef(new Map<RainOnMap, string>());

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const source = map.getSource(RAIN_LAYER) as maplibregl.ImageSource | undefined;
    if (frame === null) {
      if (map.getLayer(RAIN_LAYER)) map.setLayoutProperty(RAIN_LAYER, 'visibility', 'none');
      return;
    }
    const cache = cacheRef.current;
    const url = cache.get(frame) ?? frameImage(frame);
    cache.set(frame, url);
    // Keep only the last 60 pictures (the 7 days have 56 frames).
    if (cache.size > 60) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    const coordinates = imageCorners(frame.grid);
    if (source) {
      source.updateImage({ url, coordinates });
    } else {
      map.addSource(RAIN_LAYER, { type: 'image', url, coordinates });
      // Under the town outlines (and so under the PAR and the storm tracks, added later on top).
      const before = map.getLayer('town-outline') ? 'town-outline' : undefined;
      map.addLayer(
        {
          id: RAIN_LAYER,
          type: 'raster',
          source: RAIN_LAYER,
          paint: { 'raster-opacity': 0.75, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
        },
        before,
      );
    }
    map.setLayoutProperty(RAIN_LAYER, 'visibility', 'visible');
  }, [ready, frame, mapRef]);

  // Colours follow the theme: drop every picture drawn in the old one.
  useEffect(() => {
    cacheRef.current = new Map();
  }, [theme]);
}
