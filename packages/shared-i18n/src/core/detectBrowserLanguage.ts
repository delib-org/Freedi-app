import { LanguagesEnum, DEFAULT_LANGUAGE, isValidLanguage } from './constants';

/**
 * Detect the user's preferred language from browser settings.
 * Iterates through navigator.languages (or navigator.language) and
 * returns the first supported language. Falls back to DEFAULT_LANGUAGE
 * if no match is found or if running in a non-browser environment (SSR).
 */
export function detectBrowserLanguage(): LanguagesEnum {
  if (typeof navigator === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  const browserLanguages = navigator.languages ?? [navigator.language];

  for (const lang of browserLanguages) {
    const code = lang.split('-')[0]?.toLowerCase();
    if (code && isValidLanguage(code)) {
      return code;
    }
  }

  return DEFAULT_LANGUAGE;
}
