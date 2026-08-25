import { useEffect } from 'react';
import { getDirection } from '@freedi/shared-i18n';
import { useTranslation } from '@freedi/shared-i18n/react';

/**
 * Keeps `<html dir lang>` in sync with the active translation language so
 * logical CSS properties (inset-inline-*, margin-inline-*, text-align: start)
 * and the `[dir='rtl']` selectors flip the whole app for Hebrew / Arabic / Farsi.
 * Call once, near the root (App.tsx).
 */
export function useDocumentDirection(): void {
	const { currentLanguage } = useTranslation();

	useEffect(() => {
		document.documentElement.dir = getDirection(currentLanguage);
		document.documentElement.lang = currentLanguage;
	}, [currentLanguage]);
}
