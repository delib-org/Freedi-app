import m from 'mithril';
import { safeStorage } from '@/lib/safeStorage';

/**
 * Runtime i18n for Tables, same mechanism as join-class: one locale chunk per
 * language, fetched on demand; English is the fallback for missing keys.
 * Hebrew-first: an unset browser gets Hebrew RTL.
 */

type LangCode = 'he' | 'en' | 'ar';
type Dictionary = Record<string, string>;

// The import() specifiers must stay literal so Vite can split the chunks.
const localeLoaders: Record<LangCode, () => Promise<{ default: Dictionary }>> = {
	he: () => import('@/lib/locales/he'),
	en: () => import('@/lib/locales/en'),
	ar: () => import('@/lib/locales/ar'),
};

const RTL_LANGS: ReadonlySet<LangCode> = new Set<LangCode>(['he', 'ar']);
const DEFAULT_LANG: LangCode = 'he';
const FALLBACK_LANG: LangCode = 'en';
const LANG_STORAGE_KEY = 'freedi_tables_lang';

const translations: Partial<Record<LangCode, Dictionary>> = {};
let currentLang: LangCode = DEFAULT_LANG;

export function isSupported(lang: string | null | undefined): lang is LangCode {
	return lang === 'he' || lang === 'en' || lang === 'ar';
}

/** ?lang= first, then the saved choice, then the browser, then Hebrew. */
export function detectLanguage(search: string, stored: string | null, browser: string): LangCode {
	const urlLang = new URLSearchParams(search).get('lang');

	if (isSupported(urlLang)) return urlLang;
	if (isSupported(stored)) return stored;

	const browserLang = browser.split('-')[0];

	return isSupported(browserLang) && browserLang !== 'en' ? browserLang : DEFAULT_LANG;
}

async function loadLocale(lang: LangCode): Promise<void> {
	if (translations[lang]) return;

	try {
		const mod = await localeLoaders[lang]();

		translations[lang] = mod.default;
	} catch {
		// A failed chunk (offline, stale hash after a deploy) degrades to English.
	}
}

function applyLang(lang: LangCode): void {
	currentLang = lang;
	document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
	document.documentElement.lang = lang;
}

/** Resolve the visitor's language and have its dictionary in hand before the first mount. */
export async function initI18n(): Promise<void> {
	const lang = detectLanguage(
		window.location.search,
		safeStorage.getItem(LANG_STORAGE_KEY),
		navigator.language,
	);

	await Promise.all([loadLocale(lang), loadLocale(FALLBACK_LANG)]);
	applyLang(lang);
}

export function getLang(): LangCode {
	return currentLang;
}

export function setLang(lang: LangCode): void {
	safeStorage.setItem(LANG_STORAGE_KEY, lang);
	void loadLocale(lang).then(() => {
		applyLang(lang);
		m.redraw();
	});
}

export function isRTL(): boolean {
	return RTL_LANGS.has(currentLang);
}

/** Translate a key: current language, then English, then the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
	let text = translations[currentLang]?.[key] ?? translations[FALLBACK_LANG]?.[key] ?? key;

	if (params) {
		for (const [name, value] of Object.entries(params)) {
			text = text.split(`{{${name}}}`).join(String(value));
		}
	}

	return text;
}

function hasKey(key: string): boolean {
	return translations[currentLang]?.[key] !== undefined;
}

/**
 * Translate a counted sentence: picks `${base}.${form}` by the current language's plural
 * rules, or `.other` for a form the sentence does not need (Arabic zero, say).
 */
export function tPlural(
	base: string,
	count: number,
	params: Record<string, string | number> = {},
): string {
	const form = new Intl.PluralRules(currentLang).select(count);
	const key = hasKey(`${base}.${form}`) ? `${base}.${form}` : `${base}.other`;

	return t(key, { count, ...params });
}

export function getAvailableLanguages(): Array<{ code: LangCode; name: string }> {
	return [
		{ code: 'he', name: 'עברית' },
		{ code: 'en', name: 'English' },
		{ code: 'ar', name: 'العربية' },
	];
}
