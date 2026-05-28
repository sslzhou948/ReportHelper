import { getRealcaseOcrDrafts, type RealcaseDraft } from '../fixtures/realcase.js';

export type OcrDraft = RealcaseDraft;

export type FixtureRecognitionInput = {
  caseIds?: string[];
};

export type OcrProvider = {
  recognizeFixture(input: FixtureRecognitionInput): Promise<OcrDraft[]>;
};

class FixtureOcrProvider implements OcrProvider {
  async recognizeFixture(input: FixtureRecognitionInput): Promise<OcrDraft[]> {
    return getRealcaseOcrDrafts(input.caseIds);
  }
}

export function createOcrProvider(): OcrProvider {
  return new FixtureOcrProvider();
}
