import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';

/** Only used to resolve a relative path; never navigated to. */
const PARSING_ORIGIN = 'https://freedi.invalid';

/** Returning to these after signing in would loop straight back to a closed door. */
const NON_RETURN_PATHS: readonly string[] = ['/start', '/401'];

/**
 * The same-origin `pathname + search` of a redirect target, or undefined when
 * the value could leave the app. Browsers read a backslash as a slash and drop
 * tabs and newlines, so `/\evil.com` and `/<tab>/evil.com` count as absolute.
 */
export function toSafeRedirectPath(target: unknown): string | undefined {
	if (typeof target !== 'string') return undefined;
	if (!target.startsWith('/') || /[\\\s]/.test(target)) return undefined;

	try {
		const url = new URL(target, PARSING_ORIGIN);
		// Checked after parsing: `/a/..//evil.com` only becomes `//evil.com` here.
		if (url.origin !== PARSING_ORIGIN || url.pathname.startsWith('//')) return undefined;
		if (NON_RETURN_PATHS.includes(url.pathname.replace(/\/+$/, ''))) return undefined;

		return `${url.pathname}${url.search}`;
	} catch {
		return undefined;
	}
}

/** Remembers where to return after signing in. Unsafe targets are not stored. */
export function saveInitialRoute(target: string): void {
	const pathname = toSafeRedirectPath(target);
	if (!pathname) return;

	try {
		localStorage.setItem(LocalStorageObjects.InitialRoute, JSON.stringify({ pathname }));
	} catch {
		// Storage can be blocked; the person then lands on the home page.
	}
}

/** The saved return path, validated again because localStorage is editable. */
export function readInitialRoute(): string | undefined {
	try {
		const saved: unknown = JSON.parse(
			localStorage.getItem(LocalStorageObjects.InitialRoute) || 'null',
		);

		return toSafeRedirectPath((saved as { pathname?: unknown } | null)?.pathname);
	} catch {
		return undefined;
	}
}
