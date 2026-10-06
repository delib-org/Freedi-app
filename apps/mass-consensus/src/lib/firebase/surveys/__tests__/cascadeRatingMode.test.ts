import { __INTERNAL } from '../cascadeRatingMode';

const { readOverride, readCurrent, readSteps } = __INTERNAL;

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

  describe('readSteps', () => {
    it('defaults to the classic five steps', () => {
      expect(readSteps(undefined)).toBe(5);
      expect(readSteps({})).toBe(5);
      expect(readSteps({ ratingMode: 'agree-disagree' })).toBe(5);
    });

    it('reads the three-step scale', () => {
      expect(readSteps({ ratingMode: 'agree-disagree', ratingSteps: 3 })).toBe(3);
    });

    it('treats any other value as five steps', () => {
      expect(readSteps({ ratingSteps: 5 })).toBe(5);
      expect(readSteps({ ratingSteps: 7 })).toBe(5);
      expect(readSteps({ ratingSteps: '3' })).toBe(5);
    });
  });
});
