import React, {
  createContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import {
  LanguagesEnum,
  DEFAULT_LANGUAGE,
  STORAGE_KEY,
  getDirection,
  getRowDirection,
  type Direction,
  type RowDirection,
  type TranslationDictionary,
} from '../core';
import { languages, getLanguageData } from '../languages';

export interface TranslationContextValue {
  t: (text: string) => string;
  tWithParams: (text: string, params: Record<string, string | number>) => string;
  currentLanguage: LanguagesEnum;
  changeLanguage: (newLanguage: LanguagesEnum) => void;
  dir: Direction;
  rowDirection: RowDirection;
}

export const TranslationContext = createContext<TranslationContextValue | undefined>(
  undefined
);

interface TranslationProviderProps {
  children: ReactNode;
  initialLanguage?: LanguagesEnum;
  storageKey?: string;
}

export function TranslationProvider({
  children,
  initialLanguage,
  storageKey = STORAGE_KEY,
}: TranslationProviderProps) {
  const [language, setLanguage] = useState<LanguagesEnum>(() => {
    if (typeof window === 'undefined') {
      return initialLanguage ?? DEFAULT_LANGUAGE;
    }

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && Object.values(LanguagesEnum).includes(saved as LanguagesEnum)) {
        return saved as LanguagesEnum;
      }
    } catch {
      // localStorage not available
    }
    return initialLanguage ?? DEFAULT_LANGUAGE;
  });

  const [languageData, setLanguageData] = useState<TranslationDictionary>(() =>
    getLanguageData(language)
  );

  // Update language data when language changes
  useEffect(() => {
    setLanguageData(getLanguageData(language));
  }, [language]);

  // Save to localStorage when language changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, language);
    } catch {
      // localStorage not available
    }
  }, [language, storageKey]);

  // Update document direction when language changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.style.direction = getDirection(language);
    }
  }, [language]);

  const changeLanguage = useCallback((newLanguage: LanguagesEnum) => {
    setLanguage(newLanguage);
  }, []);

  const t = useCallback(
    (text: string): string => {
      return languageData[text] ?? text;
    },
    [languageData]
  );

  const tWithParams = useCallback(
    (text: string, params: Record<string, string | number>): string => {
      let result = languageData[text] ?? text;
      for (const [param, value] of Object.entries(params)) {
        result = result.replace(new RegExp(`{{${param}}}`, 'g'), String(value));
      }
      return result;
    },
    [languageData]
  );

  const value = useMemo<TranslationContextValue>(
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
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}
