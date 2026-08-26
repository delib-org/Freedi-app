import React, {
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
  type TranslationDictionary,
} from '../core';
import { loadLanguageData } from '../languages/loader';
import { TranslationContext, type TranslationContextValue } from './context';

interface LazyTranslationProviderProps {
  children: ReactNode;
  initialLanguage?: LanguagesEnum;
  storageKey?: string;
  /**
   * Dictionary for the initial language, if the app already awaited
   * `loadLanguageData()` before mounting. Avoids a first paint with raw keys.
   */
  initialData?: TranslationDictionary;
}

/**
 * Code-split twin of `TranslationProvider` for client-only apps (Vite SPAs).
 *
 * Only the active language's JSON is fetched — as its own chunk, via
 * `loadLanguageData` — instead of bundling all seven dictionaries. Until a
 * dictionary arrives, `t()` returns the key, which is the English text.
 * SSR apps (Next.js) should keep using the eager `TranslationProvider`.
 */
export function LazyTranslationProvider({
  children,
  initialLanguage,
  storageKey = STORAGE_KEY,
  initialData,
}: LazyTranslationProviderProps) {
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

  const [languageData, setLanguageData] = useState<TranslationDictionary>(
    () => initialData ?? {}
  );

  // Fetch the dictionary for the active language (cached per language).
  useEffect(() => {
    let cancelled = false;
    loadLanguageData(language)
      .then((data) => {
        if (!cancelled) setLanguageData(data);
      })
      .catch(() => {
        // Keep whatever we have; keys fall back to English text.
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, language);
    } catch {
      // localStorage not available
    }
  }, [language, storageKey]);

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
