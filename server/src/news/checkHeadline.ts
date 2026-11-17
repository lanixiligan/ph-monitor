// One headline through the whole news check: which provinces it names, then
// whether it is about a natural disaster and which kinds. Used by the news
// job and by the measuring script, so both judge headlines the same way.

import type { NewsType } from '@ph-monitor/shared';
import { classifyHeadline } from './keywords.ts';
import type { StormName } from './keywords.ts';
import { tagProvinces } from './tagProvinces.ts';
import type { ProvinceName, TownName } from './tagProvinces.ts';

/** What the check needs to know: the place lists and the storms seen lately. */
export type NewsContext = { provinces: ProvinceName[]; towns: TownName[]; storms: StormName[] };

export type HeadlineResult = { disaster: boolean; types: NewsType[]; provincePsgcs: number[] };

export function checkHeadline(title: string, context: NewsContext): HeadlineResult {
  // Places first: a disaster abroad still counts when it names a Philippine province.
  const provincePsgcs = tagProvinces(title, context.provinces, context.towns);
  const { disaster, types } = classifyHeadline(title, {
    storms: context.storms,
    namesProvince: provincePsgcs.length > 0,
  });
  return { disaster, types, provincePsgcs };
}
