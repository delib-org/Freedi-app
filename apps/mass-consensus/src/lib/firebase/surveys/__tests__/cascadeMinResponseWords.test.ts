import { __INTERNAL } from '../cascadeMinResponseWords';

const { readOverride, readCurrent } = __INTERNAL;

describe('cascadeMinResponseWords helpers', () => {
  describe('readOverride', () => {
    it('returns undefined when the admin never set a value', () => {
      expect(readOverride(undefined)).toBeUndefined();
      expect(readOverride({})).toBeUndefined();
      expect(readOverride({ minResponseWords: undefined })).toBeUndefined();
      expect(readOverride({ minResponseWords: 'x' })).toBeUndefined();
    });

    it('normalizes 0 and negatives to 0 (explicit "no minimum")', () => {
      expect(readOverride({ minResponseWords: 0 })).toBe(0);
      expect(readOverride({ minResponseWords: -5 })).toBe(0);
    });

    it('floors positive values', () => {
      expect(readOverride({ minResponseWords: 7 })).toBe(7);
      expect(readOverride({ minResponseWords: 7.9 })).toBe(7);
    });
  });

  describe('readCurrent', () => {
    it('treats an unset Statement value as 0', () => {
      expect(readCurrent(undefined)).toBe(0);
      expect(readCurrent({})).toBe(0);
    });

    it('reads the stored minimum', () => {
      expect(readCurrent({ minResponseWords: 3 })).toBe(3);
    });
  });
});
