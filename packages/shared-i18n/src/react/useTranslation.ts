import { useContext } from 'react';
import { TranslationContext, type TranslationContextValue } from './TranslationContext';

export function useTranslation(): TranslationContextValue {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}
