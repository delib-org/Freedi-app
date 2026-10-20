import heStrings from './locales/he';

/**
 * Odyssey's own small i18n — deliberately not @freedi/shared-i18n, whose
 * dictionaries carry ~5,000 main-app keys (300–400 kB a locale) a voyage never
 * reads. Mirrors Agora's module: Hebrew is bundled (the default and source
 * language); English and Arabic are their own chunks, fetched only by the
 * players who ask for them.
 *
 * `t()` is a plain module function so lib code and Phaser scenes can use it
 * too; React components re-render through `useT()` (useT.ts).
 */

export type Lang = 'he' | 'en' | 'ar';

export type Dictionary = Record<string, string>;

export type Params = Record<string, string | number>;

export const LANGS: readonly Lang[] = ['he', 'en', 'ar'];

export const DEFAULT_LANG: Lang = 'he';

export const STORAGE_KEY = 'odyssey_lang';

/** Each language's name in itself — the switcher shows these. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
	he: 'עברית',
	en: 'English',
	ar: 'العربية',
};

const RTL_LANGS: ReadonlySet<Lang> = new Set(['he', 'ar']);

const LOADERS: Record<Lang, () => Promise<{ default: Dictionary }>> = {
	he: () => Promise.resolve({ default: heStrings }),
	en: () => import('./locales/en'),
	ar: () => import('./locales/ar'),
};

const dictionaries: Partial<Record<Lang, Dictionary>> = { he: heStrings };

let currentLang: Lang = DEFAULT_LANG;

/** Bumped by every language request; a slow download never overrides a newer choice. */
let requestId = 0;

const listeners = new Set<(lang: Lang) => void>();

export function isLang(value: unknown): value is Lang {
	return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

export function getLang(): Lang {
	return currentLang;
}

export function isRTL(lang: Lang = currentLang): boolean {
	return RTL_LANGS.has(lang);
}

export function getDir(lang: Lang = currentLang): 'rtl' | 'ltr' {
	return isRTL(lang) ? 'rtl' : 'ltr';
}

/**
 * Precedence: the link (`?lang=`), a choice made here before, the browser's
 * languages, then Hebrew. index.html runs the same order inline so the page
 * has the right `dir` before the first paint — keep the two in step.
 */
export function detectLang(
	search: string = window.location.search,
	stored: string | null = readStored(),
	browser: readonly string[] = navigator.languages ?? [navigator.language],
): Lang {
	const asked = new URLSearchParams(search).get('lang');
	if (isLang(asked)) return asked;
	if (isLang(stored)) return stored;
	for (const tag of browser) {
		const prefix = tag.slice(0, 2).toLowerCase();
		if (isLang(prefix)) return prefix;
	}

	return DEFAULT_LANG;
}

function readStored(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function applyDocument(): void {
	if (typeof document === 'undefined') return;
	document.documentElement.lang = currentLang;
	document.documentElement.dir = getDir();
}

/**
 * Make `lang` current once its dictionary is in memory. A failed download
 * leaves the language as it was — the screen stays readable instead of
 * turning into raw keys.
 */
export async function setLang(lang: Lang, persist = true): Promise<void> {
	const mine = ++requestId;
	try {
		if (!dictionaries[lang]) dictionaries[lang] = (await LOADERS[lang]()).default;
	} catch (error) {
		console.error('[Odyssey i18n] could not load locale', lang, error);

		return;
	}
	if (mine !== requestId) return;
	currentLang = lang;
	if (persist) {
		try {
			localStorage.setItem(STORAGE_KEY, lang);
		} catch {
			// Private mode: the choice lasts for this visit only.
		}
	}
	applyDocument();
	listeners.forEach((listener) => listener(lang));
}

/** Resolve the visitor's language before the first render. */
export function initI18n(): Promise<void> {
	const lang = detectLang();
	// A `?lang=` link is a choice; a guess from the browser is not, and saving it
	// would freeze the guess.
	const asked = isLang(new URLSearchParams(window.location.search).get('lang'));

	return setLang(lang, asked);
}

export function onLangChange(listener: (lang: Lang) => void): () => void {
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
	};
}

const pluralRules = new Map<Lang, Intl.PluralRules>();

function pluralCategory(count: number): Intl.LDMLPluralRule {
	let rules = pluralRules.get(currentLang);
	if (!rules) {
		rules = new Intl.PluralRules(currentLang);
		pluralRules.set(currentLang, rules);
	}

	return rules.select(count);
}

function lookup(key: string): string | undefined {
	return dictionaries[currentLang]?.[key] ?? dictionaries.he?.[key];
}

/**
 * Translate `key`, filling `{{name}}` from `params`. A numeric `count` param
 * picks the plural form: `key_one`, `key_two`, `key_few`, … (CLDR categories
 * of the current language), falling back to `key_other`, then `key`.
 * Arabic uses all six categories; Hebrew one/two/other; English one/other.
 */
export function t(key: string, params?: Params): string {
	let template: string | undefined;
	const count = params?.count;
	if (typeof count === 'number') {
		template = lookup(`${key}_${pluralCategory(count)}`) ?? lookup(`${key}_other`);
	}
	template ??= lookup(key);
	if (template === undefined) {
		if (import.meta.env.DEV) console.error('[Odyssey i18n] missing key', key);

		return key;
	}
	if (!params) return template;

	return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
		name in params ? formatParam(params[name]) : match,
	);
}

function formatParam(value: string | number): string {
	return typeof value === 'number' ? formatNumber(value) : value;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
	return new Intl.NumberFormat(localeTag(), options).format(value);
}

/**
 * BCP-47 tag for Intl/Date APIs (`toLocaleString`, `Intl.DateTimeFormat`).
 * Arabic keeps Western digits — what Arabic media in Israel print, and the
 * same glyphs the Phaser stage draws as separate number labels.
 */
export function localeTag(lang: Lang = currentLang): string {
	return { he: 'he-IL', en: 'en-US', ar: 'ar-u-nu-latn' }[lang];
}

/** Test seam: install dictionaries without dynamic imports. */
export function __setDictionaryForTests(lang: Lang, dictionary: Dictionary): void {
	dictionaries[lang] = dictionary;
}
