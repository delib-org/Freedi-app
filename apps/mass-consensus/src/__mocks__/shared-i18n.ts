/**
 * Mock for @freedi/shared-i18n/next module
 */

export const useTranslation = jest.fn(() => ({
  t: (key: string) => key,
  tWithParams: (key: string, params: Record<string, unknown>) => {
    // Simple template replacement for testing
    let result = key;
    Object.entries(params).forEach(([k, v]) => {
      result = result.replace(`{{${k}}}`, String(v));
      result = result.replace(`{${k}}`, String(v));
    });
    return result;
  },
  currentLanguage: 'en',
  i18n: {
    language: 'en',
    changeLanguage: jest.fn(),
  },
}));

export const Trans = ({ children }: { children: React.ReactNode }) => children;

// Mock enums and constants from @freedi/shared-i18n
export enum LanguagesEnum {
  he = 'he',
  en = 'en',
  ar = 'ar',
  de = 'de',
  es = 'es',
  nl = 'nl',
}

export const LANGUAGE_NAMES: Record<LanguagesEnum, string> = {
  [LanguagesEnum.he]: 'עברית',
  [LanguagesEnum.en]: 'English',
  [LanguagesEnum.ar]: 'العربية',
  [LanguagesEnum.de]: 'Deutsch',
  [LanguagesEnum.es]: 'Español',
  [LanguagesEnum.nl]: 'Nederlands',
};

export const isRTL = (lang: string): boolean => {
  return lang === 'he' || lang === 'ar';
};
