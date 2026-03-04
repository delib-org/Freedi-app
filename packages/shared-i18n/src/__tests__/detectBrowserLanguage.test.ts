import { detectBrowserLanguage } from '../core/detectBrowserLanguage';
import { LanguagesEnum } from '../core/constants';

describe('detectBrowserLanguage', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('should return English when navigator is undefined (SSR)', () => {
    Object.defineProperty(global, 'navigator', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    expect(detectBrowserLanguage()).toBe(LanguagesEnum.en);
  });

  it('should detect English', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['en-US', 'en'], language: 'en-US' },
      writable: true,
      configurable: true,
    });

    expect(detectBrowserLanguage()).toBe(LanguagesEnum.en);
  });

  it('should detect Hebrew', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['he'], language: 'he' },
      writable: true,
      configurable: true,
    });

    expect(detectBrowserLanguage()).toBe(LanguagesEnum.he);
  });

  it('should detect Arabic', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['ar-EG'], language: 'ar-EG' },
      writable: true,
      configurable: true,
    });

    expect(detectBrowserLanguage()).toBe(LanguagesEnum.ar);
  });

  it('should detect German', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['de-DE'], language: 'de-DE' },
      writable: true,
      configurable: true,
    });

    expect(detectBrowserLanguage()).toBe(LanguagesEnum.de);
  });

  it('should detect Spanish', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['es-MX'], language: 'es-MX' },
      writable: true,
      configurable: true,
    });

    expect(detectBrowserLanguage()).toBe(LanguagesEnum.es);
  });

  it('should detect Dutch', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['nl-NL'], language: 'nl-NL' },
      writable: true,
      configurable: true,
    });

    expect(detectBrowserLanguage()).toBe(LanguagesEnum.nl);
  });

  it('should detect Farsi', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['fa-IR'], language: 'fa-IR' },
      writable: true,
      configurable: true,
    });

    expect(detectBrowserLanguage()).toBe(LanguagesEnum.fa);
  });

  it('should fall back to English for unsupported languages', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['ja', 'zh-CN', 'ko'], language: 'ja' },
      writable: true,
      configurable: true,
    });

    expect(detectBrowserLanguage()).toBe(LanguagesEnum.en);
  });

  it('should respect priority order and pick first supported language', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['ja', 'fr', 'he', 'en'], language: 'ja' },
      writable: true,
      configurable: true,
    });

    expect(detectBrowserLanguage()).toBe(LanguagesEnum.he);
  });

  it('should fall back to navigator.language when navigator.languages is undefined', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: undefined, language: 'de' },
      writable: true,
      configurable: true,
    });

    expect(detectBrowserLanguage()).toBe(LanguagesEnum.de);
  });
});
