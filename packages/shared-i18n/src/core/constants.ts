export enum LanguagesEnum {
  en = 'en',
  ar = 'ar',
  he = 'he',
  de = 'de',
  es = 'es',
  nl = 'nl',
}

export const DEFAULT_LANGUAGE = LanguagesEnum.he;

export const LANGUAGE_NAMES: Record<LanguagesEnum, string> = {
  [LanguagesEnum.en]: 'English',
  [LanguagesEnum.he]: 'עברית',
  [LanguagesEnum.ar]: 'العربية',
  [LanguagesEnum.de]: 'Deutsch',
  [LanguagesEnum.es]: 'Español',
  [LanguagesEnum.nl]: 'Nederlands',
};

export const STORAGE_KEY = 'freedi-language';
export const COOKIE_KEY = 'freedi-lang';
