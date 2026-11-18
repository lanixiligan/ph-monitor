// The weather models the heat map can show, in the order the panel lists them.
// Adding a model later means adding a row here (and its label in the i18n files).

// `import type` brings in a type only; it disappears when the code runs.
import type { HeatModelId } from './types.ts';

/** One model: its Open-Meteo name and its grid size in km. */
export type HeatModel = { id: HeatModelId; km: number };

// `HeatModel[]` = a list of HeatModel rows.
export const HEAT_MODELS: HeatModel[] = [
  { id: 'ecmwf_ifs', km: 9 }, // ECMWF IFS HRES
  { id: 'dwd_icon_global_native', km: 13 }, // DWD ICON
  { id: 'ncep_gfs_global', km: 13 }, // NOAA GFS
];

/** The model shown when the heat map is turned on. */
export const DEFAULT_HEAT_MODEL: HeatModelId = 'ecmwf_ifs';
