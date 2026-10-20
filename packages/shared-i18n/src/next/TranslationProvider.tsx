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
  initialDictionary: TranslationDictionary;
  /**
   * True when `initialDictionary` holds only the keys the app is known to use
   * (to keep the page payload small). The first lookup of a key it lacks
   * loads the full dictionary in the background, so nothing stays untranslated.
   */
  isPartialDictionary?: boolean;
}

export function NextTranslationProvider({
  children,
  initialLanguage,
  initialDictionary,
  isPartialDictionary = false,
}: NextTranslationProviderProps) {
  const [language, setLanguage] = useState<LanguagesEnum>(initialLanguage);
  const [dictionary, setDictionary] = useState<TranslationDictionary>(initialDictionary);

  // The language most recently asked for (may still be loading)
  const requestedLanguageRef = useRef<LanguagesEnum>(initialLanguage);
  const latestRequestRef = useRef(0);
  const isFullDictionaryRequestedRef = useRef(!isPartialDictionary);

  const applyLanguage = useCallback((newLanguage: LanguagesEnum): void => {
    const requestId = ++latestRequestRef.current;
    isFullDictionaryRequestedRef.current = true;
    loadLanguageData(newLanguage)
      .then((fullDictionary) => {
        // A newer request superseded this one
        if (requestId !== latestRequestRef.current) return;
        setDictionary(fullDictionary);
        setLanguage(newLanguage);
      })
      .catch((error: unknown) => {
        console.error('[NextTranslationProvider.applyLanguage] Failed to load dictionary', {
          language: newLanguage,
          error,
        });
      });
  }, []);

  const changeLanguage = useCallback(
    (newLanguage: LanguagesEnum) => {
      requestedLanguageRef.current = newLanguage;
      applyLanguage(newLanguage);

      // Persist to cookie for server-side reading
      document.cookie = `${COOKIE_KEY}=${newLanguage};path=/;max-age=31536000;SameSite=Lax`;
    },
    [applyLanguage]
  );

  const lookup = useCallback(
    (key: string): string => {
      const value = dictionary[key];
      if (value !== undefined) return value;

      if (!isFullDictionaryRequestedRef.current) {
        isFullDictionaryRequestedRef.current = true;
        // Deferred: never start a state update from inside a render
        Promise.resolve().then(() => applyLanguage(requestedLanguageRef.current));
      }

      return key;
    },
    [dictionary, applyLanguage]
  );

  // Update document direction when language changes
  useEffect(() => {
    document.documentElement.dir = getDirection(language);
    document.documentElement.lang = language;
  }, [language]);

  const tWithParams = useCallback(
    (key: string, params: Record<string, string | number>): string => {
      let result = lookup(key);
      for (const [param, value] of Object.entries(params)) {
        result = result.replace(new RegExp(`{{${param}}}`, 'g'), String(value));
      }

      return result;
    },
    [lookup]
  );

  const value = useMemo<NextTranslationContextValue>(
    () => ({
      t: lookup,
      tWithParams,
      currentLanguage: language,
      changeLanguage,
      dir: getDirection(language),
      rowDirection: getRowDirection(language),
    }),
    [lookup, tWithParams, language, changeLanguage]
  );

  return (
    <NextTranslationContext.Provider value={value}>
      {children}
    </NextTranslationContext.Provider>
  );
}
