import { countWords, meetsWordMinimum } from '../wordCount';

describe('wordCount', () => {
  describe('countWords', () => {
    it('counts simple words', () => {
      expect(countWords('one two three')).toBe(3);
    });

    it('returns 0 for empty or whitespace-only text', () => {
      expect(countWords('')).toBe(0);
      expect(countWords('   ')).toBe(0);
    });

    it('ignores leading, trailing and duplicated whitespace', () => {
      expect(countWords('  hello   world  ')).toBe(2);
    });

    it('counts words across newlines and tabs', () => {
      expect(countWords('hello\nworld\tagain')).toBe(3);
    });

    it('counts Hebrew and Arabic words', () => {
      expect(countWords('שלום עולם')).toBe(2);
      expect(countWords('مرحبا بالعالم')).toBe(2);
    });
  });

  describe('meetsWordMinimum', () => {
    it('passes when no minimum is configured', () => {
      expect(meetsWordMinimum('a', undefined)).toBe(true);
      expect(meetsWordMinimum('a', 0)).toBe(true);
      expect(meetsWordMinimum('', undefined)).toBe(true);
    });

    it('enforces the minimum when set', () => {
      expect(meetsWordMinimum('one two', 3)).toBe(false);
      expect(meetsWordMinimum('one two three', 3)).toBe(true);
      expect(meetsWordMinimum('one two three four', 3)).toBe(true);
    });
  });
});
