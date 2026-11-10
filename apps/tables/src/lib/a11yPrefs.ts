import { safeStorage } from '@/lib/safeStorage';

/**
 * Display settings of this browser: theme, high contrast and text size, with
 * the same options as the Mass Consensus accessibility button. The small
 * script in index.html does what `applyA11yPrefs` does before the first paint,
 * so it must read the same storage key and the same fields.
 */
export const A11Y_THEMES = ['system', 'light', 'dark'] as const;
export const A11Y_SCALES = [87.5, 100, 112.5, 125, 150] as const;
export const A11Y_STORAGE_KEY = 'freedi_tables_a11y';

export type A11yTheme = (typeof A11Y_THEMES)[number];
export type A11yScale = (typeof A11Y_SCALES)[number];

export interface A11yPrefs {
	theme: A11yTheme;
	contrast: boolean;
	scale: A11yScale;
}

const DEFAULT_SCALE: A11yScale = 100;
const DARK_QUERY = '(prefers-color-scheme: dark)';

export const DEFAULT_A11Y_PREFS: Readonly<A11yPrefs> = {
	theme: 'system',
	contrast: false,
	scale: DEFAULT_SCALE,
};

function isTheme(value: unknown): value is A11yTheme {
	return A11Y_THEMES.includes(value as A11yTheme);
}

function isScale(value: unknown): value is A11yScale {
	return A11Y_SCALES.includes(value as A11yScale);
}

/** Read stored settings; anything malformed falls back to the default of that field. */
export function parseA11yPrefs(raw: string | null): A11yPrefs {
	if (!raw) return { ...DEFAULT_A11Y_PREFS };

	try {
		const value: unknown = JSON.parse(raw);

		if (typeof value !== 'object' || value === null) return { ...DEFAULT_A11Y_PREFS };

		const { theme, contrast, scale } = value as Record<string, unknown>;

		return {
			theme: isTheme(theme) ? theme : DEFAULT_A11Y_PREFS.theme,
			contrast: contrast === true,
			scale: isScale(scale) ? scale : DEFAULT_A11Y_PREFS.scale,
		};
	} catch {
		return { ...DEFAULT_A11Y_PREFS };
	}
}

/** One step up (+1) or down (-1) the text-size ladder; the ends stay where they are. */
export function stepScale(current: A11yScale, direction: 1 | -1): A11yScale {
	const index = A11Y_SCALES.indexOf(current) + direction;

	return A11Y_SCALES[Math.min(A11Y_SCALES.length - 1, Math.max(0, index))];
}

export function resolveTheme(theme: A11yTheme, systemIsDark: boolean): 'light' | 'dark' {
	if (theme === 'system') return systemIsDark ? 'dark' : 'light';

	return theme;
}

/** Put the settings on <html>: `data-theme` is always the resolved light or dark. */
export function applyA11yPrefs(root: HTMLElement, prefs: A11yPrefs, systemIsDark: boolean): void {
	root.dataset.theme = resolveTheme(prefs.theme, systemIsDark);
	root.dataset.contrast = prefs.contrast ? 'high' : 'normal';
	root.style.fontSize = prefs.scale === DEFAULT_SCALE ? '' : `${prefs.scale}%`;
}

let current: A11yPrefs = { ...DEFAULT_A11Y_PREFS };

function darkQuery(): MediaQueryList | null {
	return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
}

function applyCurrent(): void {
	applyA11yPrefs(document.documentElement, current, darkQuery()?.matches ?? false);
}

/** Load the stored settings and keep following the device theme; `onChange` redraws the logo. */
export function startA11yPrefs(onChange: () => void): void {
	current = parseA11yPrefs(safeStorage.getItem(A11Y_STORAGE_KEY));
	applyCurrent();
	darkQuery()?.addEventListener('change', () => {
		applyCurrent();
		onChange();
	});
}

export function getA11yPrefs(): Readonly<A11yPrefs> {
	return current;
}

export function setA11yPrefs(next: A11yPrefs): void {
	current = next;
	applyCurrent();
	safeStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(next));
}

export function isDarkTheme(): boolean {
	return resolveTheme(current.theme, darkQuery()?.matches ?? false) === 'dark';
}
