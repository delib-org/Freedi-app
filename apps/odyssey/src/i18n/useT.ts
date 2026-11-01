import { useEffect, useState } from 'react';
import { getDir, getLang, onLangChange, setLang, t, type Lang } from './i18n';

export interface UseT {
	t: typeof t;
	lang: Lang;
	dir: 'rtl' | 'ltr';
	setLang: (lang: Lang) => Promise<void>;
}

/** Re-renders the component when the language changes. */
export function useT(): UseT {
	const [lang, setCurrent] = useState<Lang>(getLang);

	useEffect(() => onLangChange(setCurrent), []);

	return { t, lang, dir: getDir(lang), setLang };
}
