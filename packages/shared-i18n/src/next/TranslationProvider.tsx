'use client';

import React, {
  createContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  LanguagesEnum,
  COOKIE_KEY,
  getDirection,
  getRowDirection,
  type Direction,
  type RowDirection,
  type TranslationDictionary,
} from '../core';
// Code-split loader: each language is its own chunk, fetched only when needed.
// Never import the static `../languages` barrel here — it would put all seven
// dictionaries (~2MB) into the client bundle of every page.
import { loadLanguageData } from '../languages/loader';

export interface NextTranslationContextValue {
  t: (key: string) => string;
  tWithParams: (key: string, params: Record<string, string | number>) => string;
  currentLanguage: LanguagesEnum;
  /** Switches once the new language's dictionary has loaded. */
  changeLanguage: (newLanguage: LanguagesEnum) => void;
  dir: Direction;
  rowDirection: RowDirection;
}

export const NextTranslationContext = createContext<NextTranslationContextValue | undefined>(
  undefined
);

interface NextTranslationProviderProps {
  children: React.ReactNode;
  initialLanguage: LanguagesEnum;
  /**
   * May hold only the keys the app uses (to keep the page payload small);
   * a key it lacks shows its own text, as with any missing translation.
   * changeLanguage() always loads the new language's full dictionary.
   */
  initialDictionary: TranslationDictionary;
}

export function NextTranslationProvider({
  children,
  initialLanguage,
  initialDictionary,
}: NextTranslationProviderProps) {
  const [language, setLanguage] = useState<LanguagesEnum>(initialLanguage);
  const [dictionary, setDictionary] = useState<TranslationDictionary>(initialDictionary);
  const latestRequestRef = useRef(0);

  const changeLanguage = useCallback((newLanguage: LanguagesEnum) => {
    const requestId = ++latestRequestRef.current;
    loadLanguageData(newLanguage)
      .then((newDictionary) => {
        // A newer request superseded this one
        if (requestId !== latestRequestRef.current) return;
        setDictionary(newDictionary);
        setLanguage(newLanguage);
      })
      .catch((error: unknown) => {
        console.error('[NextTranslationProvider.changeLanguage] Failed to load dictionary', {
          language: newLanguage,
          error,
        });
      });

    // Persist to cookie for server-side reading
    document.cookie = `${COOKIE_KEY}=${newLanguage};path=/;max-age=31536000;SameSite=Lax`;
  }, []);

  // Update document direction when language changes
  useEffect(() => {
    document.documentElement.dir = getDirection(language);
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback((key: string): string => dictionary[key] ?? key, [dictionary]);

  const tWithParams = useCallback(
    (key: string, params: Record<string, string | number>): string => {
      let result = t(key);
      for (const [param, value] of Object.entries(params)) {
        result = result.replace(new RegExp(`{{${param}}}`, 'g'), String(value));
      }

      return result;
    },
    [t]
  );

  const value = useMemo<NextTranslationContextValue>(
    () => ({
      t,
      tWithParams,
      currentLanguage: language,
      changeLanguage,
      dir: getDirection(language),
      rowDirection: getRowDirection(language),
    }),
    [t, tWithParams, language, changeLanguage]
  );

  return (
    <NextTranslationContext.Provider value={value}>
      {children}
    </NextTranslationContext.Provider>
  );
}
