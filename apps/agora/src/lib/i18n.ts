import m from 'mithril';
import heStrings from './locales/he';

export type LangCode = 'he' | 'en' | 'ar' | 'es' | 'de' | 'nl';

const DEFAULT_LANG: LangCode = 'he';
const RTL_LANGS: ReadonlySet<string> = new Set(['he', 'ar']);
const STORAGE_KEY = 'agora_lang';

const LANGUAGE_NAMES: Record<LangCode, string> = {
	he: 'עברית',
	en: 'English',
	ar: 'العربية',
	es: 'Español',
	de: 'Deutsch',
	nl: 'Nederlands',
};

let currentLang: LangCode = DEFAULT_LANG;

type Dictionary = Record<string, string>;

const LANG_CODES: readonly LangCode[] = ['he', 'en', 'ar', 'es', 'de', 'nl'];

/**
 * Hebrew is bundled (it is the default and most visitors' language); every
 * other dictionary is its own chunk, fetched only when somebody asks for it.
 * All six used to ship inside the entry bundle: ~500 kB of text, five-sixths
 * of it never read.
 */
const LOADERS: Record<LangCode, () => Promise<{ default: Dictionary }>> = {
	he: () => Promise.resolve({ default: heStrings }),
	en: () => import('./locales/en'),
	ar: () => import('./locales/ar'),
	es: () => import('./locales/es'),
	de: () => import('./locales/de'),
	nl: () => import('./locales/nl'),
};

const dictionaries: Partial<Record<LangCode, Dictionary>> = { he: heStrings };

/** Bumped by every language request; a slow download never overrides a newer choice. */
let requestId = 0;

async function loadDictionary(lang: LangCode): Promise<void> {
	if (dictionaries[lang]) return;
	dictionaries[lang] = (await LOADERS[lang]()).default;
}

function lookup(key: string): string | undefined {
	return dictionaries[currentLang]?.[key] ?? dictionaries.en?.[key];
}

function isLangCode(value: string): value is LangCode {
	return (LANG_CODES as readonly string[]).includes(value);
}

function applyDirection(): void {
	document.documentElement.lang = currentLang;
	document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';

	// The skip link lives in index.html, outside Mithril's root, so it is the
	// one piece of the page no view can translate. A screen reader on a Hebrew
	// document reading an English first link is the whole bug in miniature.
	const skipLink = document.querySelector('.skip-link');
	if (skipLink) skipLink.textContent = t('a11y.skip_to_content');
}

/**
 * The language a link asked for, from either query string the URL might carry.
 *
 * Agora runs Mithril's hash router, so a gate link reads
 * `/#!/join/12345?theme=odyssey&lang=he` — the parameters live inside the
 * fragment, where `location.search` cannot see them. Both places are read
 * because a plain `?lang=` on the origin is the obvious thing for a person to
 * type, and it should work.
 */
export function langFromUrl(url: string): LangCode | null {
	const hashQuery = url.slice(url.indexOf('#') + 1);
	const candidates = [
		url.includes('#') ? hashQuery.slice(hashQuery.indexOf('?') + 1) : '',
		url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '',
	];

	for (const query of candidates) {
		const asked = new URLSearchParams(query).get('lang');
		if (asked && isLangCode(asked)) return asked;
	}

	return null;
}

/**
 * Precedence: the link, then a choice made here before, then the browser.
 *
 * The link comes first because a player walking through an Odyssey gate is
 * mid-sentence in another app: the square is the next room of a voyage they
 * are already reading in one language, and `navigator.language` — an English
 * browser held by a Hebrew reader is the common case here — used to answer
 * over it. Persisting what the link asked for is what makes it survive the
 * first route change, after which the parameter is gone from the URL.
 */
export function initI18n(): Promise<void> {
	const asked = langFromUrl(window.location.href);
	if (asked) return activate(asked, true);

	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored && isLangCode(stored)) return activate(stored, false);

	const browserLang = navigator.language.slice(0, 2);

	return activate(isLangCode(browserLang) ? browserLang : DEFAULT_LANG, false);
}

/**
 * Make `lang` current once its dictionary is in memory. Resolves immediately
 * for Hebrew (bundled); otherwise after the chunk lands. A failed download
 * leaves the language as it was — the screen stays readable instead of
 * turning into raw keys.
 */
function activate(lang: LangCode, persist: boolean): Promise<void> {
	const mine = ++requestId;

	const apply = (): void => {
		if (mine !== requestId) return;
		currentLang = lang;
		if (persist) localStorage.setItem(STORAGE_KEY, lang);
		applyDirection();
		if (persist) m.redraw();
	};

	if (dictionaries[lang]) {
		apply();

		return Promise.resolve();
	}

	return loadDictionary(lang)
		.then(apply)
		.catch((error: unknown) => {
			console.error('[i18n] Could not load locale', lang, error);
			if (mine === requestId) applyDirection();
		});
}

export function getLang(): LangCode {
	return currentLang;
}

export function setLang(lang: LangCode): void {
	void activate(lang, true);
	m.redraw();
}

/** Check if current language is RTL */
export function isRTL(): boolean {
	return RTL_LANGS.has(currentLang);
}

export function t(key: string, params?: Record<string, string | number>): string {
	const text = lookup(key) ?? key;
	if (!params) return text;

	return Object.entries(params).reduce(
		(acc, [param, value]) => acc.replace(`{{${param}}}`, String(value)),
		text,
	);
}

/**
 * t() for sentences whose placeholders are not text.
 *
 * Icons cannot go through t(): it interpolates with String(), so a vnode
 * would land in the sentence as "[object Object]". This splits the translated
 * string on its {{placeholders}} and returns the pieces with each one swapped
 * for whatever you passed — a vnode, an icon, a number. Word order stays in
 * the translator's hands, which is the whole reason the placeholder exists.
 */
export function tNodes(key: string, params: Record<string, m.Children>): m.Children {
	const text = lookup(key) ?? key;

	return text.split(/(\{\{[a-zA-Z0-9_]+\}\})/g).map((piece) => {
		const name = piece.match(/^\{\{([a-zA-Z0-9_]+)\}\}$/)?.[1];

		return name && name in params ? params[name] : piece;
	});
}

/**
 * Count-aware t(): "1 ratings" reads as a bug in every language. When a
 * `<key>_one` variant exists and n is exactly 1, use it (no {{n}} needed);
 * otherwise fall back to the plural template with n interpolated.
 */
export function tCount(key: string, n: number): string {
	const oneKey = `${key}_one`;
	if (n === 1 && lookup(oneKey) !== undefined) {
		return t(oneKey);
	}

	return t(key, { n });
}

export function getAvailableLanguages(): Array<{ code: LangCode; name: string }> {
	return LANG_CODES.map((code) => ({
		code,
		name: LANGUAGE_NAMES[code],
	}));
}
