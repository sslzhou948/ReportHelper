import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export type RealcaseMetric = {
  metricKey: string;
  metricName: string;
  originalMetricName?: string;
  category?: string;
  categoryCn?: string;
  mappingStatus?: string;
  valueType: string;
  valueNumeric?: number | null;
  valueQualitative?: string | null;
  unit?: string | null;
  refRangeLow?: number | null;
  refRangeHigh?: number | null;
  refQualitative?: string | null;
  refText?: string | null;
  tone?: string;
  ocrConfidence?: number;
};

export type RealcaseDraft = {
  caseId: string;
  draftId: string;
  sourcePhotoIds: string[];
  pageCount: number;
  basicInfo: Record<string, unknown>;
  analysisPolicy?: string;
  metrics: RealcaseMetric[];
  findings?: string[];
  conflicts?: unknown[];
  warnings?: unknown[];
  status: string;
};

type FixtureModule = {
  getRealcaseOcrDrafts(caseIds?: string[]): RealcaseDraft[];
};

let fixtureModule: FixtureModule | null | undefined;

function loadFixtureModule(): FixtureModule | null {
  if (fixtureModule !== undefined) return fixtureModule;

  try {
    fixtureModule = require('../../../miniprogram/data/ocr-fixtures.js') as FixtureModule;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'MODULE_NOT_FOUND'
    ) {
      fixtureModule = null;
      return fixtureModule;
    }
    throw error;
  }

  return fixtureModule;
}

export function getRealcaseOcrDrafts(caseIds?: string[]): RealcaseDraft[] {
  return loadFixtureModule()?.getRealcaseOcrDrafts(caseIds) ?? [];
}
