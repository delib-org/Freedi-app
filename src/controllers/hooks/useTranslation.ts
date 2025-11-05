import { useUserConfig } from './useUserConfig';
import { LanguagesEnum, Direction, RowDirection } from '@/context/UserConfigContext';

export interface UseTranslationReturn {
	t: (text: string) => string;
	currentLanguage: string;
	changeLanguage: (newLanguage: LanguagesEnum) => void;
	dir: Direction;
	rowDirection: RowDirection;
}

/**
 * Hook for accessing translation functionality
 *
 * @returns Translation utilities including:
 * - t: Translation function that takes a key and returns the translated text
 * - currentLanguage: Current language code (en, ar, he, de, es, nl)
 * - changeLanguage: Function to change the current language
 * - dir: Text direction ("ltr" or "rtl")
 * - rowDirection: Flex row direction ("row" or "row-reverse")
 *
 * @example
 * ```typescript
 * const MyComponent = () => {
 *   const { t, currentLanguage, changeLanguage } = useTranslation();
 *
 *   return (
 *     <div>
 *       <h1>{t('Welcome')}</h1>
 *       <button onClick={() => changeLanguage(LanguagesEnum.en)}>
 *         English
 *       </button>
 *     </div>
 *   );
 * };
 * ```
 */
export function useTranslation(): UseTranslationReturn {
	const { t, currentLanguage, changeLanguage, dir, rowDirection } = useUserConfig();

	return {
		t,
		currentLanguage,
		changeLanguage,
		dir,
		rowDirection,
	};
}
