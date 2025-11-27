'use client';

import { useContext } from 'react';
import {
  NextTranslationContext,
  type NextTranslationContextValue,
} from './TranslationProvider';

export function useTranslation(): NextTranslationContextValue {
  const context = useContext(NextTranslationContext);
  if (!context) {
    throw new Error(
      'useTranslation must be used within a NextTranslationProvider. ' +
      'Make sure to wrap your app with <NextTranslationProvider> in your layout.'
    );
  }
  return context;
}
