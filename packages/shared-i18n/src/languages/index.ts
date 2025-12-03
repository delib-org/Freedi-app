import { LanguagesEnum } from '../core/constants';
import type { TranslationDictionary } from '../core/translator';

import en from './en.json';
import he from './he.json';
import ar from './ar.json';
import de from './de.json';
import es from './es.json';
import nl from './nl.json';

export const languages: Record<LanguagesEnum, TranslationDictionary> = {
  [LanguagesEnum.en]: en,
  [LanguagesEnum.he]: he,
  [LanguagesEnum.ar]: ar,
  [LanguagesEnum.de]: de,
  [LanguagesEnum.es]: es,
  [LanguagesEnum.nl]: nl,
};

export function getLanguageData(language: LanguagesEnum): TranslationDictionary {
  return languages[language] ?? languages[LanguagesEnum.en];
}

export { en, he, ar, de, es, nl };
