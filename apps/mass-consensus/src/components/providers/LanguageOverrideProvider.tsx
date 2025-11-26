'use client';

import { useEffect } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { LanguagesEnum, DEFAULT_LANGUAGE, COOKIE_KEY } from '@freedi/shared-i18n';
import { isValidLanguage } from '@freedi/shared-i18n/next';

interface LanguageOverrideProviderProps {
  adminLanguage?: string;
  children: React.ReactNode;
}

/**
 * Client component that applies admin language override when:
 * 1. Admin has set a defaultLanguage on the statement
 * 2. User doesn't have a cookie preference (explicit language selection)
 * 3. Browser didn't provide a supported language (current === system default)
 * 4. Admin language is different from current language
 *
 * This ensures survey participants see the admin's intended language
 * when they have no explicit preference.
 */
export function LanguageOverrideProvider({
  adminLanguage,
  children,
}: LanguageOverrideProviderProps) {
  const { currentLanguage, changeLanguage } = useTranslation();

  useEffect(() => {
    // Only override if all conditions are met:
    // 1. Admin has set a language preference for this survey
    if (!adminLanguage || !isValidLanguage(adminLanguage)) {
      return;
    }

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
  }, [adminLanguage, currentLanguage, changeLanguage]);

  return <>{children}</>;
}
