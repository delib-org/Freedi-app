/**
 * The root layout sends the client only the translation keys listed in
 * src/generated/i18nClientKeys.json. These tests keep that list honest.
 */

import committedKeys from '@/generated/i18nClientKeys.json';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const generator = require('../../../../scripts/generate-i18n-keys.js') as {
  collectTranslationKeys: (sourceTexts: string[], dictionaryKeys: Set<string>) => string[];
  buildClientKeys: () => string[];
};

describe('collectTranslationKeys', () => {
  const dictionaryKeys = new Set(['Submit', 'Cancel', 'labelKey_a', 'Unused']);

  it('finds keys in single, double and plain template literals', () => {
    const source = "t('Submit'); t(\"Cancel\"); const k = `labelKey_a`;";

    expect(generator.collectTranslationKeys([source], dictionaryKeys)).toEqual([
      'Cancel',
      'Submit',
      'labelKey_a',
    ]);
  });

  it('ignores literals that are not dictionary keys', () => {
    expect(generator.collectTranslationKeys(["t('Nope')"], dictionaryKeys)).toEqual([]);
  });

  it('ignores templates with interpolation', () => {
    expect(generator.collectTranslationKeys(['t(`Sub${x}`)'], dictionaryKeys)).toEqual([]);
  });

  it('is not thrown off by interpolated templates or apostrophes earlier in the file', () => {
    const source = [
      'const a = `${x} px`;',
      "// don't stop here",
      'const b = `${y}`;',
      "const c = <p title={t('Submit')}>It's here</p>;",
    ].join('\n');

    expect(generator.collectTranslationKeys([source], dictionaryKeys)).toEqual(['Submit']);
  });

  it('returns each key once, sorted', () => {
    const sources = ["t('Submit')", "t('Submit'); t('Cancel')"];

    expect(generator.collectTranslationKeys(sources, dictionaryKeys)).toEqual(['Cancel', 'Submit']);
  });
});

describe('i18nClientKeys.json', () => {
  it('is up to date with the source (run `npm run i18n:keys`)', () => {
    expect(committedKeys).toEqual(generator.buildClientKeys());
  });

  it('covers the keys of the student question screens', () => {
    expect(committedKeys).toEqual(expect.arrayContaining(['signInWithGoogle']));
  });
});
