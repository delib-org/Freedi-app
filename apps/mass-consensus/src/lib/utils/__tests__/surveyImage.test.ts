import { altFromFileName, buildSurveyImagePath, insertMarkdownImage } from '../surveyImage';

describe('surveyImage', () => {
  describe('buildSurveyImagePath', () => {
    it('places the file under the survey with the type extension', () => {
      const path = buildSurveyImagePath('s1', 'image/jpeg', 1700000000000);
      expect(path).toMatch(/^surveys\/s1\/images\/1700000000000-[a-z0-9]+\.jpg$/);
    });

    it('gives two uploads at the same instant different names', () => {
      const a = buildSurveyImagePath('s1', 'image/png', 1);
      const b = buildSurveyImagePath('s1', 'image/png', 1);
      expect(a).not.toBe(b);
    });
  });

  describe('altFromFileName', () => {
    it('drops the extension and turns separators into spaces', () => {
      expect(altFromFileName('our_town-square.webp')).toBe('our town square');
    });

    it('caps the length', () => {
      expect(altFromFileName(`${'a'.repeat(300)}.png`)).toHaveLength(200);
    });
  });

  describe('insertMarkdownImage', () => {
    it('inserts at the caret on its own line', () => {
      const result = insertMarkdownImage('Hello world', 5, 'https://x/y.png', 'pic');
      expect(result.content).toBe('Hello\n![pic](https://x/y.png)\n world');
      expect(result.content.slice(result.caret)).toBe('\n world');
    });

    it('adds no blank lines when already at a line boundary', () => {
      const result = insertMarkdownImage('First\n', 6, 'u', 'a');
      expect(result.content).toBe('First\n![a](u)');
      expect(result.caret).toBe(result.content.length);
    });

    it('appends to empty content', () => {
      expect(insertMarkdownImage('', 0, 'u', 'a').content).toBe('![a](u)');
    });

    it('clamps a caret past the end and strips brackets from the alt', () => {
      const result = insertMarkdownImage('abc', 99, 'u', 'x[1]');
      expect(result.content).toBe('abc\n![x1](u)');
    });
  });
});
