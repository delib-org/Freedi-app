import { __INTERNAL } from '../cascadeAutoAiHandling';

const { readFlag, readEffective, readCurrent } = __INTERNAL;

describe('cascadeAutoAiHandling helpers', () => {
  describe('readFlag', () => {
    it('returns undefined when the flag was never set', () => {
      expect(readFlag(undefined, 'autoSplitMultiSuggestions')).toBeUndefined();
      expect(readFlag({}, 'autoSplitMultiSuggestions')).toBeUndefined();
      expect(readFlag({ autoSplitMultiSuggestions: undefined }, 'autoSplitMultiSuggestions')).toBeUndefined();
    });

    it('ignores non-boolean values', () => {
      expect(readFlag({ autoMergeSimilar: 'true' }, 'autoMergeSimilar')).toBeUndefined();
      expect(readFlag({ autoMergeSimilar: 1 }, 'autoMergeSimilar')).toBeUndefined();
    });

    it('reads both booleans', () => {
      expect(readFlag({ autoMergeSimilar: true }, 'autoMergeSimilar')).toBe(true);
      expect(readFlag({ autoMergeSimilar: false }, 'autoMergeSimilar')).toBe(false);
    });
  });

  describe('readEffective', () => {
    it('is undefined when neither the survey nor the question set it', () => {
      expect(readEffective({}, {}, 'autoSplitMultiSuggestions')).toBeUndefined();
      expect(readEffective(undefined, undefined, 'autoSplitMultiSuggestions')).toBeUndefined();
    });

    it('falls back to the survey-wide default', () => {
      expect(
        readEffective({ autoSplitMultiSuggestions: true }, {}, 'autoSplitMultiSuggestions'),
      ).toBe(true);
    });

    it('lets a per-question override win, including turning it off', () => {
      expect(
        readEffective(
          { autoSplitMultiSuggestions: true },
          { autoSplitMultiSuggestions: false },
          'autoSplitMultiSuggestions',
        ),
      ).toBe(false);

      expect(
        readEffective(
          { autoMergeSimilar: false },
          { autoMergeSimilar: true },
          'autoMergeSimilar',
        ),
      ).toBe(true);
    });

    it('keeps the two fields independent', () => {
      const surveySettings = { autoSplitMultiSuggestions: true };

      expect(readEffective(surveySettings, {}, 'autoMergeSimilar')).toBeUndefined();
    });
  });

  describe('readCurrent', () => {
    it('treats an unset Statement field as off', () => {
      expect(readCurrent(undefined, 'autoSplitMultiSuggestions')).toBe(false);
      expect(readCurrent({}, 'autoSplitMultiSuggestions')).toBe(false);
    });

    it('reads what the Statement carries', () => {
      expect(readCurrent({ autoSplitMultiSuggestions: true }, 'autoSplitMultiSuggestions')).toBe(true);
    });
  });
});
