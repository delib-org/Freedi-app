/**
 * Chat-app i18n — a thin Svelte-store layer over the repo's shared i18n
 * (`@freedi/shared-i18n`). The shared package owns the dictionaries (7 langs,
 * one JSON per language) and the RTL/direction logic; this module only adapts
 * them to Svelte stores so components can do `{$t('English source string')}`.
 *
 * Lookup convention (matches the main app + MC): the English text IS the key,
 * and `translate()` falls back to the key itself when a translation is missing
 * — so English always renders, and untranslated keys degrade to English.
 *
 * SSR renders with the language `hooks.server.ts` resolved (cookie →
 * Accept-Language → en); `initLang()` (onMount) syncs the client store to it,
 * and `setLanguage()` switches + persists (cookie for SSR, localStorage for the
 * next visit) and flips `<html dir>` for RTL languages (he/ar/fa).
 */
import { derived, writable } from 'svelte/store';
import {
	COOKIE_KEY,
	DEFAULT_LANGUAGE,
	detectBrowserLanguage,
	getDirection,
	isValidLanguage,
	LanguagesEnum,
	languages,
	translate,
	translateWithParams,
} from '@freedi/shared-i18n';

export type Lang = LanguagesEnum;

export { LanguagesEnum, LANGUAGE_NAMES, getDirection, isRTL } from '@freedi/shared-i18n';

/** Languages offered in the chat-app switcher (the full shared set). */
export const LANGS: LanguagesEnum[] = Object.values(LanguagesEnum);

const STORAGE_KEY = 'chat.lang';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const dictOf = (l: LanguagesEnum) => languages[l] ?? languages[LanguagesEnum.en];

/** Current language. Reactive; drives `t`/`tp` and the `<html dir>` toggle. */
export const lang = writable<LanguagesEnum>(DEFAULT_LANGUAGE);

/** `$t('English source')` → translated string (falls back to the key). */
export const t = derived(lang, ($lang) => {
	const dict = dictOf($lang);

	return (key: string): string => translate(key, dict);
});

/** `$tp('{{count}} options', { count })` → translated, interpolated string. */
export const tp = derived(lang, ($lang) => {
	const dict = dictOf($lang);

	return (key: string, params: Record<string, string | number>): string =>
		translateWithParams(key, dict, params);
});

function applyDocumentDir(l: LanguagesEnum): void {
	if (typeof document === 'undefined') return;
	document.documentElement.lang = l;
	document.documentElement.dir = getDirection(l);
}

function persist(l: LanguagesEnum): void {
	if (typeof document === 'undefined') return;
	try {
		window.localStorage.setItem(STORAGE_KEY, l);
	} catch {
		// Private mode / storage disabled — cookie is enough for SSR.
	}
	document.cookie = `${COOKIE_KEY}=${l}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

/** Switch the active language, persist it, and flip text direction. */
export function setLanguage(next: string): void {
	const l: LanguagesEnum = isValidLanguage(next) ? next : DEFAULT_LANGUAGE;
	lang.set(l);
	applyDocumentDir(l);
	persist(l);
}

/**
 * Sync the client store with the SSR-chosen language so hydration matches.
 * `?lang=` (explicit override) wins; otherwise trust the server's choice, then
 * localStorage, then the browser. Persists so SSR stays in sync on reload.
 */
export function initLang(serverLang?: string): void {
	if (typeof window === 'undefined') return;

	const fromUrl = new URL(window.location.href).searchParams.get('lang');
	let fromStorage: string | null = null;
	try {
		fromStorage = window.localStorage.getItem(STORAGE_KEY);
	} catch {
		fromStorage = null;
	}

	const chosen =
		[fromUrl, serverLang, fromStorage].find((l): l is string => !!l && isValidLanguage(l)) ??
		detectBrowserLanguage();

	setLanguage(chosen);
}
