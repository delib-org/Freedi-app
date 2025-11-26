import {
  LanguagesEnum,
  DEFAULT_LANGUAGE,
  COOKIE_KEY,
  getDirection,
  getRowDirection,
  type Direction,
  type RowDirection,
  type TranslationDictionary,
} from '../core';
import { languages, getLanguageData } from '../languages';

export interface ServerTranslations {
  t: (key: string) => string;
  tWithParams: (key: string, params: Record<string, string | number>) => string;
  lang: LanguagesEnum;
  dir: Direction;
  rowDirection: RowDirection;
  dictionary: TranslationDictionary;
}

export function isValidLanguage(lang: string): lang is LanguagesEnum {
  return Object.values(LanguagesEnum).includes(lang as LanguagesEnum);
}

/**
 * Detect language from request headers, cookies, and admin override.
 * For use in Next.js Server Components.
 *
 * Priority order:
 * 1. User cookie preference (highest priority)
 * 2. Browser Accept-Language header
 * 3. Admin's statement.defaultLanguage (for surveys)
 * 4. System default (fallback)
 */
export async function detectLanguage(
  cookieValue?: string | null,
  acceptLanguage?: string | null,
  adminDefaultLanguage?: string | null
): Promise<LanguagesEnum> {
  // Priority 1: Check cookie (user preference - highest priority)
  if (cookieValue && isValidLanguage(cookieValue)) {
    return cookieValue;
  }

  // Priority 2: Check Accept-Language header (browser preference)
  if (acceptLanguage) {
    const preferred = acceptLanguage.split(',')[0]?.split('-')[0]?.toLowerCase();
    if (preferred && isValidLanguage(preferred)) {
      return preferred;
    }
  }

  // Priority 3: Admin's default language (for surveys without user/browser preference)
  if (adminDefaultLanguage && isValidLanguage(adminDefaultLanguage)) {
    return adminDefaultLanguage;
  }

  // Priority 4: System default
  return DEFAULT_LANGUAGE;
}

/**
 * Get translations for Next.js Server Components.
 * Can be called directly in Server Components, generateMetadata, etc.
 */
export function getTranslations(language: LanguagesEnum = DEFAULT_LANGUAGE): ServerTranslations {
  const dictionary = getLanguageData(language);

  const t = (key: string): string => {
    return dictionary[key] ?? key;
  };

  const tWithParams = (key: string, params: Record<string, string | number>): string => {
    let result = dictionary[key] ?? key;
    for (const [param, value] of Object.entries(params)) {
      result = result.replace(new RegExp(`{{${param}}}`, 'g'), String(value));
    }
    return result;
  };

  return {
    t,
    tWithParams,
    lang: language,
    dir: getDirection(language),
    rowDirection: getRowDirection(language),
    dictionary,
  };
}

/**
 * Helper to get translations with automatic language detection from Next.js headers/cookies.
 * Import { cookies, headers } from 'next/headers' and pass them in.
 */
export async function getServerTranslations(
  getCookieValue: () => Promise<string | undefined>,
  getAcceptLanguage: () => Promise<string | null>
): Promise<ServerTranslations> {
  const cookieValue = await getCookieValue();
  const acceptLanguage = await getAcceptLanguage();
  const language = await detectLanguage(cookieValue, acceptLanguage);
  return getTranslations(language);
}
