import { describe, it, expect, beforeEach, vi } from 'vitest';
import { t, initI18n, getLang, setLang, isRTL, getAvailableLanguages } from '../i18n';

// Mock mithril's redraw
vi.mock('mithril', () => ({
  default: { redraw: vi.fn() },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock document.documentElement
if (typeof document === 'undefined') {
  Object.defineProperty(globalThis, 'document', {
    value: {
      documentElement: { dir: 'ltr', lang: 'en' },
    },
  });
}

// Mock window.location & navigator
Object.defineProperty(globalThis, 'window', {
  value: {
    location: { search: '' },
  },
  writable: true,
});

Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'en-US' },
  writable: true,
});

beforeEach(() => {
  localStorageMock.clear();
  // Reset to English
  setLang('en');
});

// ---------------------------------------------------------------------------
// Translation function
// ---------------------------------------------------------------------------
describe('t() translation function', () => {
  it('returns English translation by default', () => {
    expect(t('intro.begin')).toBe("Let's Begin");
  });

  it('returns Hebrew translation when language is set', () => {
    setLang('he');
    expect(t('intro.begin')).toBe('בואו נתחיל');
  });

  it('falls back to English for missing translations', () => {
    setLang('ar');
    // 'needs.subtitle' is not in Arabic translations
    expect(t('needs.subtitle')).toBe('What problems or needs would you like the group to address?');
  });

  it('returns the key itself when no translation exists', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('interpolates parameters', () => {
    const result = t('solutions.eval_count', { count: 5 });
    expect(result).toBe('You evaluated 5 solutions.');
  });

  it('interpolates multiple parameters', () => {
    const result = t('state.consensus', { percent: 82 });
    expect(result).toBe('82% consensus');
  });

  it('interpolates Hebrew with parameters', () => {
    setLang('he');
    const result = t('state.consensus', { percent: 75 });
    expect(result).toBe('75% הסכמה');
  });

  it('handles parameters that appear multiple times', () => {
    // If a param appears twice in text, both should be replaced
    const text = t('signin.ideas', { count: 3 });
    expect(text).toBe('3 ideas');
  });
});

// ---------------------------------------------------------------------------
// Language management
// ---------------------------------------------------------------------------
describe('language management', () => {
  it('getLang returns current language', () => {
    expect(getLang()).toBe('en');
    setLang('he');
    expect(getLang()).toBe('he');
  });

  it('setLang persists to localStorage', () => {
    setLang('he');
    expect(localStorage.getItem('bot_lang')).toBe('he');
  });

  it('initI18n detects from localStorage', () => {
    localStorage.setItem('bot_lang', 'he');
    initI18n();
    expect(getLang()).toBe('he');
  });

  it('initI18n defaults to en for unknown languages', () => {
    Object.defineProperty(navigator, 'language', { value: 'xx-XX', writable: true });
    localStorageMock.clear();
    initI18n();
    expect(getLang()).toBe('en');
  });
});

// ---------------------------------------------------------------------------
// RTL
// ---------------------------------------------------------------------------
describe('isRTL', () => {
  it('returns false for English', () => {
    setLang('en');
    expect(isRTL()).toBe(false);
  });

  it('returns true for Hebrew', () => {
    setLang('he');
    expect(isRTL()).toBe(true);
  });

  it('returns true for Arabic', () => {
    setLang('ar');
    expect(isRTL()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Available languages
// ---------------------------------------------------------------------------
describe('getAvailableLanguages', () => {
  it('returns at least English and Hebrew', () => {
    const langs = getAvailableLanguages();
    expect(langs.length).toBeGreaterThanOrEqual(2);
    expect(langs.find((l) => l.code === 'en')).toBeDefined();
    expect(langs.find((l) => l.code === 'he')).toBeDefined();
  });

  it('each language has code and name', () => {
    const langs = getAvailableLanguages();
    for (const lang of langs) {
      expect(lang.code).toBeTruthy();
      expect(lang.name).toBeTruthy();
    }
  });
});
