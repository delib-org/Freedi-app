// Server-side exports (for Server Components)
export {
  getTranslations,
  getServerTranslations,
  detectLanguage,
  isValidLanguage,
  type ServerTranslations,
} from './getTranslations';

// Client-side exports (for Client Components)
export {
  NextTranslationContext,
  NextTranslationProvider,
  type NextTranslationContextValue,
} from './TranslationProvider';

export { useTranslation } from './useTranslation';

// Re-export constants
export { COOKIE_KEY } from '../core/constants';
