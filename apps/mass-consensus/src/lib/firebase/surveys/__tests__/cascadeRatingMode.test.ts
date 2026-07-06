import { __INTERNAL } from '../cascadeRatingMode';

const { readOverride, readCurrent } = __INTERNAL;

describe('cascadeRatingMode helpers', () => {
  describe('readOverride', () => {
    it('returns undefined when the admin never set a value', () => {
      expect(readOverride(undefined)).toBeUndefined();
      expect(readOverride({})).toBeUndefined();
      expect(readOverride({ ratingMode: undefined })).toBeUndefined();
    });

    it('ignores invalid / unknown modes', () => {
      expect(readOverride({ ratingMode: 'nonsense' })).toBeUndefined();
      expect(readOverride({ ratingMode: 5 })).toBeUndefined();
    });

    it('reads a valid explicit override', () => {
      expect(readOverride({ ratingMode: 'reactions' })).toBe('reactions');
      expect(readOverride({ ratingMode: 'agree-disagree' })).toBe('agree-disagree');
    });
  });

  describe('readCurrent', () => {
    it('treats an unset Statement value as agree-disagree', () => {
      expect(readCurrent(undefined)).toBe('agree-disagree');
      expect(readCurrent({})).toBe('agree-disagree');
    });

    it('reads the stored mode', () => {
      expect(readCurrent({ ratingMode: 'reactions' })).toBe('reactions');
    });
  });
});
