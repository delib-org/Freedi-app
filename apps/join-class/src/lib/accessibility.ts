/**
 * Accessibility singleton — manages font-size scaling and high-contrast mode.
 *
 * State is persisted under the same localStorage key used by the main app
 * ('userConfig') so user preferences carry across apps without extra setup.
 *
 * High-contrast mode works by toggling a data attribute on <html>. CSS in
 * _tokens.scss uses that attribute selector to apply the high-contrast token
 * overrides declared there.
 */

const STORAGE_KEY = 'userConfig';
const HC_ATTR = 'data-high-contrast';
const FONT_ATTR = 'data-font-scale';

export const FONT_SIZE_MIN = 14;
export const FONT_SIZE_MAX = 24;
export const FONT_SIZE_DEFAULT = 16;

interface A11yPrefs {
	fontSize: number;
	highContrast: boolean;
}

type ChangeListener = (prefs: A11yPrefs) => void;

function loadPrefs(): A11yPrefs {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed: unknown = JSON.parse(raw);
			if (
				parsed !== null &&
				typeof parsed === 'object' &&
				'fontSize' in parsed &&
				'colorContrast' in parsed
			) {
				const p = parsed as { fontSize: unknown; colorContrast: unknown };

				return {
					fontSize:
						typeof p.fontSize === 'number' &&
						p.fontSize >= FONT_SIZE_MIN &&
						p.fontSize <= FONT_SIZE_MAX
							? p.fontSize
							: FONT_SIZE_DEFAULT,
					highContrast: typeof p.colorContrast === 'boolean' ? p.colorContrast : false,
				};
			}
		}
	} catch {
		// Ignore parse errors — fall through to defaults
	}

	return { fontSize: FONT_SIZE_DEFAULT, highContrast: false };
}

function savePrefs(prefs: A11yPrefs): void {
	try {
		// Merge with whatever else is in the key (e.g. chosenLanguage from the
		// main app) rather than overwriting the whole object.
		const raw = localStorage.getItem(STORAGE_KEY);
		const existing: Record<string, unknown> = raw
			? (JSON.parse(raw) as Record<string, unknown>)
			: {};
		existing.fontSize = prefs.fontSize;
		existing.colorContrast = prefs.highContrast;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
	} catch {
		// localStorage may be unavailable in private browsing; ignore silently
	}
}

function applyToDOM(prefs: A11yPrefs): void {
	document.documentElement.style.fontSize = `${prefs.fontSize}px`;

	if (prefs.highContrast) {
		document.documentElement.setAttribute(HC_ATTR, '');
		document.documentElement.setAttribute(FONT_ATTR, String(prefs.fontSize));
	} else {
		document.documentElement.removeAttribute(HC_ATTR);
		document.documentElement.setAttribute(FONT_ATTR, String(prefs.fontSize));
	}
}

class AccessibilityStore {
	private prefs: A11yPrefs;
	private listeners: Set<ChangeListener> = new Set();

	constructor() {
		this.prefs = loadPrefs();
		applyToDOM(this.prefs);
	}

	getPrefs(): Readonly<A11yPrefs> {
		return { ...this.prefs };
	}

	setFontSize(size: number): void {
		const clamped = Math.min(Math.max(size, FONT_SIZE_MIN), FONT_SIZE_MAX);
		if (clamped === this.prefs.fontSize) return;
		this.prefs = { ...this.prefs, fontSize: clamped };
		this.commit();
	}

	setHighContrast(on: boolean): void {
		if (on === this.prefs.highContrast) return;
		this.prefs = { ...this.prefs, highContrast: on };
		this.commit();
	}

	onChange(fn: ChangeListener): () => void {
		this.listeners.add(fn);

		return () => {
			this.listeners.delete(fn);
		};
	}

	private commit(): void {
		savePrefs(this.prefs);
		applyToDOM(this.prefs);
		this.listeners.forEach((fn) => fn({ ...this.prefs }));
	}
}

export const a11yStore = new AccessibilityStore();
