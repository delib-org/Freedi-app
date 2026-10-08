import { DisplayMode, SuggestionMode } from '@freedi/shared-types';
import { isAddDisabledResponse, resolveCanAddOptions } from '../participantOptions';
import type { MergedQuestionSettings } from '../settingsUtils';

const merged = (overrides: Partial<MergedQuestionSettings> = {}): MergedQuestionSettings => ({
  allowParticipantsToAddSuggestions: true,
  suggestionsClosed: false,
  askUserForASolutionBeforeEvaluation: true,
  allowSkipping: false,
  minEvaluationsPerQuestion: 3,
  randomizeOptions: false,
  suggestionMode: SuggestionMode.restrict,
  displayMode: DisplayMode.swipe,
  showViewProgress: true,
  askUserForASolutionAfterEvaluation: false,
  autoSplitMultiSuggestions: false,
  autoMergeSimilar: false,
  cardColorIntensity: 1,
  blockParticipantOptions: false,
  ...overrides,
});

describe('resolveCanAddOptions', () => {
  it('defaults to true when there is no survey (standalone question)', () => {
    expect(resolveCanAddOptions(undefined)).toBe(true);
    expect(resolveCanAddOptions(undefined, false)).toBe(true);
  });

  it('is false when the server says the question is blocked, whatever the settings', () => {
    expect(resolveCanAddOptions(undefined, true)).toBe(false);
    expect(resolveCanAddOptions(merged(), true)).toBe(false);
  });

  it('is false when the merged settings block participant options', () => {
    expect(resolveCanAddOptions(merged({ blockParticipantOptions: true }))).toBe(false);
    expect(
      resolveCanAddOptions(
        merged({ blockParticipantOptions: true, allowParticipantsToAddSuggestions: true }),
      ),
    ).toBe(false);
  });

  it('otherwise follows the merged allowParticipantsToAddSuggestions', () => {
    expect(resolveCanAddOptions(merged({ allowParticipantsToAddSuggestions: true }))).toBe(true);
    expect(resolveCanAddOptions(merged({ allowParticipantsToAddSuggestions: false }))).toBe(false);
  });
});

describe('isAddDisabledResponse', () => {
  it('recognises the ADD_DISABLED refusal body', () => {
    expect(isAddDisabledResponse({ error: 'nope', code: 'ADD_DISABLED' })).toBe(true);
    expect(isAddDisabledResponse({ error: 'nope', code: 'ADD_DISABLED', ok: false })).toBe(true);
  });

  it('is false for other refusals and for non-object bodies', () => {
    expect(isAddDisabledResponse({ error: 'limit', code: 'LIMIT_REACHED' })).toBe(false);
    expect(isAddDisabledResponse({ error: 'plain' })).toBe(false);
    expect(isAddDisabledResponse(null)).toBe(false);
    expect(isAddDisabledResponse(undefined)).toBe(false);
    expect(isAddDisabledResponse('ADD_DISABLED')).toBe(false);
  });
});
