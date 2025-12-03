'use client';

import React, {
  createContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
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
import { getLanguageData } from '../languages';

export interface NextTranslationContextValue {
  t: (key: string) => string;
  tWithParams: (key: string, params: Record<string, string | number>) => string;
  currentLanguage: LanguagesEnum;
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
}

export function NextTranslationProvider({
  children,
  initialLanguage,
  initialDictionary,
}: NextTranslationProviderProps) {
  const [language, setLanguage] = useState<LanguagesEnum>(initialLanguage);
  const [dictionary, setDictionary] = useState<TranslationDictionary>(initialDictionary);

  const changeLanguage = useCallback((newLanguage: LanguagesEnum) => {
    // Update dictionary
    const newDictionary = getLanguageData(newLanguage);
    setDictionary(newDictionary);
    setLanguage(newLanguage);

    // Persist to cookie for server-side reading
    document.cookie = `${COOKIE_KEY}=${newLanguage};path=/;max-age=31536000;SameSite=Lax`;
  }, []);

  // Update document direction when language changes
  useEffect(() => {
    document.documentElement.dir = getDirection(language);
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: string): string => {
      return dictionary[key] ?? key;
    },
    [dictionary]
  );

  const tWithParams = useCallback(
    (key: string, params: Record<string, string | number>): string => {
      let result = dictionary[key] ?? key;
      for (const [param, value] of Object.entries(params)) {
        result = result.replace(new RegExp(`{{${param}}}`, 'g'), String(value));
      }
      return result;
    },
    [dictionary]
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
