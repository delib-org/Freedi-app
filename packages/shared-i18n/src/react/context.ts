import { createContext } from 'react';
import type { LanguagesEnum, Direction, RowDirection } from '../core';

/**
 * The React context shared by every translation provider.
 *
 * Lives in its own module — with NO language imports — so that consumers of
 * the context (`useTranslation`, `LazyTranslationProvider`) never drag the
 * eager `../languages` barrel (≈1.7 MB of JSON) into a client bundle.
 */
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
