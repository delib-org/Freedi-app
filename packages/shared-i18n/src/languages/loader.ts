import { LanguagesEnum, DEFAULT_LANGUAGE } from '../core/constants';
import type { TranslationDictionary } from '../core/translator';

/**
 * Async, code-split language loading. Unlike the static `languages` barrel
 * (which bundles ALL dictionaries eagerly — fine for server-side apps),
 * each dynamic import below becomes its own chunk in Vite/webpack builds,
 * so client apps ship only the language the user actually uses.
 */
const loaders: Record<LanguagesEnum, () => Promise<{ default: TranslationDictionary }>> = {
	[LanguagesEnum.en]: () => import('./en.json'),
	[LanguagesEnum.he]: () => import('./he.json'),
	[LanguagesEnum.ar]: () => import('./ar.json'),
	[LanguagesEnum.de]: () => import('./de.json'),
	[LanguagesEnum.es]: () => import('./es.json'),
	[LanguagesEnum.nl]: () => import('./nl.json'),
	[LanguagesEnum.fa]: () => import('./fa.json'),
};

const cache = new Map<LanguagesEnum, Promise<TranslationDictionary>>();

export function loadLanguageData(language: LanguagesEnum): Promise<TranslationDictionary> {
	const lang: LanguagesEnum = loaders[language] ? language : DEFAULT_LANGUAGE;

	let promise = cache.get(lang);
	if (!promise) {
		promise = loaders[lang]().then((module) => module.default);
		// Drop failed loads from the cache so a later call can retry
		promise.catch(() => cache.delete(lang));
		cache.set(lang, promise);
	}

	return promise;
}
