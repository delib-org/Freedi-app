// Server-side exports (for Server Components)
export {
  getTranslations,
  getServerTranslations,
  detectLanguage,
  type ServerTranslations,
} from './getTranslations';

// Client-side exports (for Client Components)
export {
  NextTranslationContext,
  NextTranslationProvider,
  type NextTranslationContextValue,
} from './TranslationProvider';

export { useTranslation } from './useTranslation';
