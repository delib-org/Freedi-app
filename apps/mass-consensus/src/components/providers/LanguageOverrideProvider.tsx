'use client';

import { useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { LanguagesEnum, DEFAULT_LANGUAGE, COOKIE_KEY, getDirection } from '@freedi/shared-i18n';
import { isValidLanguage } from '@freedi/shared-i18n/next';

interface LanguageOverrideProviderProps {
  adminLanguage?: string;
  forceLanguage?: boolean;
  children: React.ReactNode;
}

/**
 * Client component that applies admin language override when:
 *
 * If forceLanguage is TRUE:
 * - Always use admin's defaultLanguage regardless of user preferences
 *
 * If forceLanguage is FALSE (default):
 * 1. Admin has set a defaultLanguage on the statement
 * 2. User doesn't have a cookie preference (explicit language selection)
 * 3. Browser didn't provide a supported language (current === system default)
 * 4. Admin language is different from current language
 *
 * This ensures survey participants see the admin's intended language
 * when they have no explicit preference, or always when forceLanguage is enabled.
 */
export function LanguageOverrideProvider({
  adminLanguage,
  forceLanguage = false,
  children,
}: LanguageOverrideProviderProps) {
  const { currentLanguage, changeLanguage } = useTranslation();

  // Update document direction when language changes
  useEffect(() => {
    const dir = getDirection(currentLanguage as LanguagesEnum);
    document.documentElement.dir = dir;
    document.documentElement.lang = currentLanguage;
  }, [currentLanguage]);

  useEffect(() => {
    // 1. Admin has set a language preference for this survey
    if (!adminLanguage || !isValidLanguage(adminLanguage)) {
      return;
    }

    // If forceLanguage is enabled, override regardless of user preferences
    if (forceLanguage) {
      if (adminLanguage !== currentLanguage) {
        changeLanguage(adminLanguage as LanguagesEnum);
      }
      return;
    }

    // Default behavior: Only override if user has no explicit preference
    // 2. User doesn't have a cookie preference (they haven't explicitly chosen)
    const hasCookie = document.cookie.includes(COOKIE_KEY);
    if (hasCookie) {
      return;
    }

    // 3. Current language is the system default (meaning browser didn't provide one)
    const isSystemDefault = currentLanguage === DEFAULT_LANGUAGE;
    if (!isSystemDefault) {
      return;
    }

    // 4. Admin language is different from current language
    if (adminLanguage === currentLanguage) {
      return;
    }

    // All conditions met - apply admin's language preference
    changeLanguage(adminLanguage as LanguagesEnum);
  }, [adminLanguage, forceLanguage, currentLanguage, changeLanguage]);

  return <>{children}</>;
}
