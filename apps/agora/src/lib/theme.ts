import { fontById, fontStack, loadFont } from './fonts';
import {
	AGORA_DEFAULT_THEME,
	AgoraResolvedTheme,
	AgoraThemeSeeds,
	resolveAgoraTheme,
	ThemeParticipant,
	ThemeSession,
} from '@freedi/shared-types';

/**
 * The looks the app wears.
 *
 * Four, and they are all one mechanism: every colour in the app is a token on
 * `:root`, so a single attribute on the document element repaints the whole
 * thing without touching a component rule. See `styles/_theme-candy-block`,
 * `_theme-civic-block` and `_theme-custom-block`.
 *
 *   candy   the default — vibrant candy-shop colours on a cotton-candy page
 *   purple  the look the app shipped with ("Purple Agora")
 *   custom  a look a student built from four seed colours; the seeds ride on
 *           the document element as custom properties and the stylesheet
 *           grows the rest of the palette from them
 *   civic   Odyssey's navy and gold — a civic square is the next room of a
 *           voyage the player was already walking through, and it does not
 *           get a say
 *
 * Who picks is decided in shared-types (`resolveAgoraTheme`): the person's
 * own choice, then the room's, then the default.
 */

/** Value of `data-session-theme` when the page should wear Odyssey's colours */
export const ODYSSEY_THEME = 'civic';

export type ThemeAttr = 'civic' | 'candy' | 'purple' | 'custom';

/** Address-bar colour per look — the page colour each one paints */
const THEME_COLORS: Record<ThemeAttr, string> = {
	civic: '#06182c',
	candy: '#fff5fa',
	purple: '#ffffff',
	custom: '#ffffff',
};

/** The seed custom properties the custom block reads — one per seed colour */
const SEED_PROPS: Record<keyof AgoraThemeSeeds, string> = {
	page: '--seed-page',
	mine: '--seed-mine',
	peer: '--seed-peer',
	go: '--seed-go',
};

/**
 * Remembered so the look survives a reload of a session we have not read yet.
 *
 * The session document arrives one round trip after first paint, which is long
 * enough to see the wrong palette and watch it change. So the last look painted
 * is written down, and the very first render can be right. The civic gate
 * carries its answer in its own URL and records it here too.
 */
const STORAGE_KEY = 'agora:session-theme';

export function attrOf(resolved: AgoraResolvedTheme): ThemeAttr {
	return resolved.kind;
}

/** Paint a resolved look onto the document: the attribute, the seeds, the address bar */
export function paintTheme(resolved: AgoraResolvedTheme): void {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	const attr = attrOf(resolved);
	root.dataset.sessionTheme = attr;

	for (const [seed, prop] of Object.entries(SEED_PROPS) as Array<[keyof AgoraThemeSeeds, string]>) {
		if (resolved.kind === 'custom') root.style.setProperty(prop, resolved.custom.seeds[seed]);
		else root.style.removeProperty(prop);
	}
	applyFont(resolved.kind === 'custom' ? resolved.custom.font : undefined);

	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) {
		meta.setAttribute(
			'content',
			resolved.kind === 'custom' ? resolved.custom.seeds.page : THEME_COLORS[attr],
		);
	}
}

/** The face a look asked for, once its file is here; nothing, if it asked for none */
let wantedFont: string | undefined;

function applyFont(id: string | undefined): void {
	const root = document.documentElement;
	wantedFont = id;
	const font = fontById(id);
	if (!font) {
		root.style.removeProperty('--font-display');
		root.style.removeProperty('--display-weight');

		return;
	}
	void loadFont(font.id).then(() => {
		// The look may have changed while the file was in flight
		if (wantedFont !== font.id) return;
		root.style.setProperty('--font-display', fontStack(font));
		root.style.setProperty('--display-weight', String(font.weight));
	});
}

export function rememberTheme(resolved: AgoraResolvedTheme | null): void {
	try {
		if (resolved) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
		else sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		// A browser with storage disabled simply gets the one-frame flash.
	}
}

function readRemembered(): AgoraResolvedTheme | null {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		// The gate wrote the bare word before looks existed; honour it
		if (raw === ODYSSEY_THEME) return { kind: 'civic' };
		const parsed: unknown = JSON.parse(raw);
		if (parsed && typeof parsed === 'object' && 'kind' in parsed) {
			return parsed as AgoraResolvedTheme;
		}
	} catch {
		// Nothing to restore, nothing to do.
	}

	return null;
}

/**
 * Paint the remembered look before anything renders — or the default, so a
 * page with no session (the home screen, the teacher's desk) still wears the
 * company's look rather than the token file's base.
 */
export function applyRememberedTheme(): void {
	if (typeof document === 'undefined') return;
	paintTheme(readRemembered() ?? { kind: AGORA_DEFAULT_THEME });
}

/**
 * Dress the page for a session and, when there is one, the person in it.
 *
 * Runs on every session and participant snapshot, so a teacher re-dressing
 * the room mid-lesson repaints every phone, and a student's own pick lands
 * the moment their participant doc says so. A null session paints nothing:
 * absent state must leave the remembered guess alone, or every civic square
 * flashes candy before its own colours arrive.
 */
export function applySessionTheme(
	session: ThemeSession | null,
	participant: ThemeParticipant | null = null,
): void {
	if (!session) return;
	const resolved = resolveAgoraTheme(session, participant);
	paintTheme(resolved);
	rememberTheme(resolved);
}

/** The look the document is wearing right now, as the stylesheet sees it */
export function currentThemeAttr(): ThemeAttr | undefined {
	if (typeof document === 'undefined') return undefined;

	return document.documentElement.dataset.sessionTheme as ThemeAttr | undefined;
}
