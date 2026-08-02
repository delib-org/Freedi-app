import m from 'mithril';
import en from '@/lib/locales/en';

/** Runtime i18n for the join app.
 *
 *  Only English is bundled into the entry chunk. The other six locales live in
 *  `lib/locales/` and are fetched individually — all seven inline came to
 *  172 kB raw / 44 kB gzipped, of which a given visitor read exactly one.
 *
 *  The fetch is not deferred in the usual sense: `index.html` sniffs the same
 *  signals `detectLanguage()` uses and emits a `<link rel="modulepreload">` for
 *  the matching chunk, so the browser starts it from the preload scanner at the
 *  same moment as the entry bundle rather than a round trip later. Boot then
 *  waits for the dictionary before the first mount, which is why there is no
 *  flash of English and no LTR→RTL flip. English stays inline as the
 *  synchronous fallback for missing keys and for a failed locale fetch. */

type LangCode = string;

/** Locale chunks, keyed by code. The `import()` specifiers must stay literal —
 *  a computed specifier would leave Vite unable to see the dependency and it
 *  would fall back to bundling nothing at all. English is absent by design:
 *  it is statically imported above. */
const localeLoaders: Record<string, () => Promise<{ default: Record<string, string> }>> = {
	ar: () => import('@/lib/locales/ar'),
	de: () => import('@/lib/locales/de'),
	es: () => import('@/lib/locales/es'),
	fa: () => import('@/lib/locales/fa'),
	he: () => import('@/lib/locales/he'),
	nl: () => import('@/lib/locales/nl'),
};

/** Dictionaries available right now. Grows as locale chunks land. */
const translations: Record<string, Record<string, string>> = { en };

/** Codes with RTL script. `ar`/`fa` are here even though the bundled Assistant
 *  webfont has no Arabic coverage — direction still has to flip; the glyphs
 *  come from the system fallback stack. */
const RTL_LANGS = new Set(['he', 'ar', 'fa']);

function isSupported(lang: string | null | undefined): lang is LangCode {
	return !!lang && (lang === 'en' || lang in localeLoaders);
}

const localeRequests = new Map<string, Promise<void>>();

/** Fetch a locale's dictionary, once. Resolves (rather than rejects) on a
 *  failed chunk load: a visitor who can't reach the locale chunk is better off
 *  reading English than staring at a dead splash screen. */
function loadLocale(lang: string): Promise<void> {
	if (translations[lang]) return Promise.resolve();

	const loader = localeLoaders[lang];
	if (!loader) return Promise.resolve();

	let request = localeRequests.get(lang);
	if (!request) {
		request = loader()
			.then((mod) => {
				translations[lang] = mod.default;
				// A dictionary can land after whoever asked for it gave up
				// waiting — the boot timeout below, or a facilitator language
				// push that raced a slow chunk. If it's still the active
				// language, swap the visible strings now.
				if (lang === currentLang) {
					notifyLangChange();
					m.redraw();
				}
			})
			.catch(() => {
				// Offline, blocked, or a stale hashed filename after a deploy.
				// `translate()` falls through to English on its own.
			});
		localeRequests.set(lang, request);
	}

	return request;
}

/** Upper bound on how long the first mount will wait for a locale chunk.
 *  Generous, because the audience this whole change is aimed at is on a slow
 *  link — but not unbounded, so a chunk that never arrives degrades to English
 *  instead of pinning the boot splash forever. */
const LOCALE_BOOT_TIMEOUT_MS = 8000;

let currentLang: LangCode = 'en';

// Did the user make an explicit language choice (via ?lang= or prior setLang)?
// If not, the statement's defaultLanguage is allowed to override the browser
// default on load.
let userExplicitLang = false;

// Tracks whether the active language is currently being forced by the
// facilitator (statement.forceLanguage === true on the main statement or
// the active question). Read by the participant-facing widget so it can
// disable its own language picker and show a "Set by facilitator" chip.
// Cleared as soon as no force flag is active on the relevant docs.
let forcedByAdmin = false;

// The locale a facilitator language push is currently waiting on, if any.
// See `applyStatementLanguage`.
let pendingStatementLang: string | null = null;

type LangChangeListener = () => void;
const langChangeListeners = new Set<LangChangeListener>();

function notifyLangChange(): void {
	for (const listener of langChangeListeners) {
		try {
			listener();
		} catch {
			/* listener errors must not break i18n state for other subscribers */
		}
	}
}

/** Subscribe to language / force-state changes. Used by vanilla-DOM widgets
 *  (the AccessibilityWidget) that live outside Mithril's redraw loop and
 *  need to refresh their labels and lock state when the language flips —
 *  whether the user picked it themselves, the admin pushed a default, or
 *  the admin enabled `forceLanguage`. Returns an unsubscribe function. */
export function onLangChange(listener: LangChangeListener): () => void {
	langChangeListeners.add(listener);

	return () => langChangeListeners.delete(listener);
}

/** True when the active language is being forced by the facilitator.
 *  Participants can still see the picker but it should be disabled with a
 *  "Set by facilitator" indicator so the lack of interactivity is explained. */
export function isLanguageForced(): boolean {
	return forcedByAdmin;
}

/** Language detection.
 *
 *  NOTE: the inline boot script in `index.html` reimplements this same
 *  precedence (?lang= → localStorage → navigator.language → en) so it can
 *  preload the right locale chunk before this module has even parsed. If the
 *  order changes here, change it there too. A mismatch is not fatal — it just
 *  wastes a preload and costs the round trip this avoids. */
function detectLanguage(): { lang: LangCode; explicit: boolean } {
	const params = new URLSearchParams(window.location.search);
	const urlLang = params.get('lang');
	if (isSupported(urlLang)) {
		return { lang: urlLang, explicit: true };
	}

	const stored = localStorage.getItem('freedi_join_lang');
	if (isSupported(stored)) {
		return { lang: stored, explicit: true };
	}

	const browserLang = navigator.language.split('-')[0];
	if (isSupported(browserLang)) {
		return { lang: browserLang, explicit: false };
	}

	return { lang: 'en', explicit: false };
}

/** Direction + `lang` attribute only. Split out of `applyLang` so boot can flip
 *  the document to RTL the instant the language is *known*, without waiting for
 *  its dictionary — the splash screen is already on screen at that point and
 *  would otherwise visibly reflow when the strings arrive. */
function applyDocumentLocale(lang: LangCode): void {
	document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
	document.documentElement.lang = lang;
}

function applyLang(lang: LangCode): void {
	const changed = lang !== currentLang;
	currentLang = lang;
	applyDocumentLocale(lang);
	if (changed) notifyLangChange();
}

/** Resolve the visitor's language and have its dictionary in hand.
 *
 *  Callers must await this before the first render, otherwise a non-English
 *  visitor sees English text for a frame. In practice the wait overlaps with
 *  the Firebase auth handshake that boot performs anyway, and the chunk itself
 *  was already requested by the preload in `index.html`. */
export function initI18n(): Promise<void> {
	const { lang, explicit } = detectLanguage();
	userExplicitLang = explicit;
	applyDocumentLocale(lang);

	if (lang === 'en') {
		applyLang(lang);

		return Promise.resolve();
	}

	const timeout = new Promise<void>((resolve) => {
		window.setTimeout(resolve, LOCALE_BOOT_TIMEOUT_MS);
	});

	return Promise.race([loadLocale(lang), timeout]).then(() => {
		applyLang(lang);
	});
}

export function getLang(): LangCode {
	return currentLang;
}

export function setLang(lang: LangCode): void {
	if (!isSupported(lang)) return;
	if (forcedByAdmin) return; // Force flag wins; ignore participant attempts.
	userExplicitLang = true;
	localStorage.setItem('freedi_join_lang', lang);

	// The dictionary may not be here yet (first switch to this language). Hold
	// the swap until it is, so the UI changes language in one step rather than
	// flipping direction first and translating a moment later. The picker the
	// user just clicked stays interactive throughout.
	void loadLocale(lang).then(() => {
		applyLang(lang);
		notifyLangChange(); // Fire even when lang didn't change so consumers can redraw.
		m.redraw();
	});
}

/**
 * Apply the language preference declared on a Statement (typically the
 * question set in the main app). Priority rules:
 *   - statement.forceLanguage === true  →  always wins, even over URL/localStorage
 *   - otherwise, statement.defaultLanguage wins only when the user hasn't
 *     made an explicit choice (URL param or prior setLang)
 * Returns true if the active language changed.
 *
 * Also tracks the force-state into a module-level flag so the participant-facing
 * widget can disable its picker and show a lock chip. The flag is only touched
 * when the caller actually carries a language opinion — calls with no
 * `defaultLanguage` are treated as "no opinion" and leave the prior force
 * state intact. This matters because the join app sync's both the main
 * statement *and* the active question independently; the question doc usually
 * has no language fields and shouldn't clobber what the hub set.
 *
 * The returned boolean now means "the active language is changing" rather than
 * "has changed" — when the target locale isn't loaded yet the swap completes a
 * moment later and issues its own redraw. Both call sites ignore the value.
 */
export function applyStatementLanguage(defaultLanguage?: string, forceLanguage?: boolean): boolean {
	if (!defaultLanguage || !isSupported(defaultLanguage)) {
		return false;
	}

	const wasForced = forcedByAdmin;
	const nowForced = forceLanguage === true;
	forcedByAdmin = nowForced;

	// `pendingStatementLang` covers the gap between asking for a locale and its
	// chunk arriving. Without it, the Firestore snapshot handlers that call this
	// — which fire repeatedly — would each queue another swap for a language
	// that is already on its way.
	if (defaultLanguage === currentLang || defaultLanguage === pendingStatementLang) {
		if (wasForced !== nowForced) notifyLangChange();

		return false;
	}

	const shouldApply = forceLanguage === true || !userExplicitLang;
	if (!shouldApply) {
		if (wasForced !== nowForced) notifyLangChange();

		return false;
	}

	pendingStatementLang = defaultLanguage;
	void loadLocale(defaultLanguage).then(() => {
		pendingStatementLang = null;
		applyLang(defaultLanguage);
		m.redraw();
	});

	return true;
}

export function isRTL(): boolean {
	return RTL_LANGS.has(currentLang);
}

export function t(key: string, params?: Record<string, string | number>): string {
	return translate(key, currentLang, params);
}

/** Translate a key using a specific language override, falling back to the
 *  current active language, then English, then the key itself. Useful when
 *  an admin-stored language (e.g. a saved form's formLanguage) must override
 *  the visitor's UI language for a specific section. */
export function translate(
	key: string,
	lang: LangCode | undefined,
	params?: Record<string, string | number>,
): string {
	const override = lang ? translations[lang] : undefined;
	const active = translations[currentLang] ?? translations.en;
	let text = override?.[key] ?? active[key] ?? translations.en[key] ?? key;

	if (params) {
		for (const [k, v] of Object.entries(params)) {
			text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
		}
	}

	return text;
}

export function getAvailableLanguages(): Array<{ code: string; name: string }> {
	return [
		{ code: 'en', name: 'English' },
		{ code: 'he', name: 'עברית' },
		{ code: 'ar', name: 'العربية' },
		{ code: 'de', name: 'Deutsch' },
		{ code: 'es', name: 'Español' },
		{ code: 'nl', name: 'Nederlands' },
		{ code: 'fa', name: 'فارسی' },
	];
}
