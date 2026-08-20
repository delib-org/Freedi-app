/**
 * The two looks the app wears.
 *
 * A classroom session keeps Agora's own palette. A civic square is the next
 * room of a voyage the player was already walking through, so it wears
 * Odyssey's navy and gold instead — the sea they arrived from, rather than a
 * different product wearing the same content.
 *
 * The switch is one attribute on the document element, which is all the
 * stylesheet needs: every colour in the app is a token on `:root`, so a single
 * override block repaints the whole thing. See `styles/_theme-civic.scss`.
 */

/** Value of `data-session-theme` when the page should wear Odyssey's colours */
export const ODYSSEY_THEME = 'civic';

/** Address-bar colour for each look — Odyssey's sea, and Agora's own page */
export const ODYSSEY_THEME_COLOR = '#06182c';
export const AGORA_THEME_COLOR = '#ffffff';

/**
 * Remembered so the theme survives a reload of a session we have not read yet.
 *
 * The session document arrives one round trip after first paint, which is long
 * enough to see the wrong palette and watch it change. The gate carries the
 * answer in its own URL, so the join route can record it here and the very
 * first render can be right.
 */
const STORAGE_KEY = 'agora:session-theme';

export function rememberSessionTheme(theme: string | null): void {
	try {
		if (theme) sessionStorage.setItem(STORAGE_KEY, theme);
		else sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		// A browser with storage disabled simply gets the one-frame flash.
	}
}

/** Paint the remembered theme before anything renders. */
export function applyRememberedTheme(): void {
	if (typeof document === 'undefined') return;
	try {
		const remembered = sessionStorage.getItem(STORAGE_KEY);
		if (remembered) document.documentElement.dataset.sessionTheme = remembered;
	} catch {
		// Same as above — nothing to restore, nothing to do.
	}
}
