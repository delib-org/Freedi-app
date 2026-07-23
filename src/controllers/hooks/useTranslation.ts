import { useContext, useMemo, useCallback } from 'react';
import {
	UserConfigContext,
	LanguagesEnum,
	Direction,
	RowDirection,
} from '@/context/UserConfigContext';
import { getDirection, getRowDirection } from '@freedi/shared-i18n';

export interface UseTranslationReturn {
	t: (text: string) => string;
	currentLanguage: string;
	changeLanguage: (newLanguage: LanguagesEnum) => void;
	dir: Direction;
	rowDirection: RowDirection;
}

/**
 * Hook for accessing translation functionality
 * Works even outside UserConfigProvider (falls back to the key, which is English text)
 */
export function useTranslation(): UseTranslationReturn {
	const context = useContext(UserConfigContext);

	// Fallback translation function — keys are English text, so identity is safe
	const fallbackT = useCallback((text: string) => text, []);

	// Fallback when context is not available
	const fallback = useMemo<UseTranslationReturn>(
		() => ({
			t: fallbackT,
			currentLanguage: LanguagesEnum.en,
			changeLanguage: () => {},
			dir: getDirection(LanguagesEnum.en),
			rowDirection: getRowDirection(LanguagesEnum.en),
		}),
		[fallbackT],
	);

	if (!context) {
		return fallback;
	}

	return {
		t: context.t,
		currentLanguage: context.currentLanguage,
		changeLanguage: context.changeLanguage,
		dir: context.dir,
		rowDirection: context.rowDirection,
	};
}
