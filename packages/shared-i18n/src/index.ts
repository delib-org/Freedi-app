// Core exports
export {
  LanguagesEnum,
  DEFAULT_LANGUAGE,
  LANGUAGE_NAMES,
  STORAGE_KEY,
  COOKIE_KEY,
  isValidLanguage,
  detectBrowserLanguage,
  getDirection,
  getRowDirection,
  isRTL,
  translate,
  translateWithParams,
  createTranslator,
  type Direction,
  type RowDirection,
  type TranslationDictionary,
} from './core';

// Language exports (static — bundles ALL dictionaries; use server-side only)
export { languages, getLanguageData, en, he, ar, de, es, nl } from './languages';

// Async, code-split language loading (use in client apps)
export { loadLanguageData } from './languages/loader';
