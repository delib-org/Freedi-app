import { LanguagesEnum } from './constants';

export type Direction = 'ltr' | 'rtl';
export type RowDirection = 'row' | 'row-reverse';

const RTL_LANGUAGES = new Set([LanguagesEnum.ar, LanguagesEnum.he]);

export function getDirection(language: LanguagesEnum): Direction {
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}

export function getRowDirection(language: LanguagesEnum): RowDirection {
  return RTL_LANGUAGES.has(language) ? 'row-reverse' : 'row';
}

export function isRTL(language: LanguagesEnum): boolean {
  return RTL_LANGUAGES.has(language);
}
