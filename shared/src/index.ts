// The front door of this package: other code imports from '@ph-monitor/shared'
// and gets whatever is re-exported here.

// `export type *` passes along types only (they vanish when the code runs).
export type * from './types.ts';

export { APP_NAME } from './appInfo.ts';
export { NEWS_TYPES } from './newsTypes.ts';
export type { NewsType } from './newsTypes.ts';
export { HEAT_MODELS, DEFAULT_HEAT_MODEL } from './heatModels.ts';
export type { HeatModel } from './heatModels.ts';
