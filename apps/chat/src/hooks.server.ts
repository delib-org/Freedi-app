/**
 * Resolves `locals.user` from the `__session` cookie on every request, so
 * `+page.server.ts` loaders/actions know who is signed in without any client
 * Firebase. The cookie is a Firebase **session cookie** minted by
 * `routes/api/session/+server.ts` from a client ID token.
 */
import type { Handle } from '@sveltejs/kit';
import {
	COOKIE_KEY,
	DEFAULT_LANGUAGE,
	getDirection,
	isValidLanguage,
	LanguagesEnum,
} from '@freedi/shared-i18n';
import { adminAuth } from '$lib/server/firebaseAdmin';

const SESSION_COOKIE = '__session';

/**
 * Pick the language to render with so the very first SSR'd HTML already carries
 * the right `lang`/`dir` (no RTL flash on reload). Priority: the `freedi-lang`
 * cookie the client persists on switch → the browser's `Accept-Language` → en.
 */
function detectServerLanguage(event: Parameters<Handle>[0]['event']): string {
	const fromCookie = event.cookies.get(COOKIE_KEY);
	if (fromCookie && isValidLanguage(fromCookie)) return fromCookie;

	const accept = event.request.headers.get('accept-language');
	if (accept) {
		for (const part of accept.split(',')) {
			const code = part.trim().split(';')[0]?.split('-')[0]?.toLowerCase();
			if (code && isValidLanguage(code)) return code;
		}
	}

	return DEFAULT_LANGUAGE;
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.lang = detectServerLanguage(event);

	const cookie = event.cookies.get(SESSION_COOKIE);
	if (cookie) {
		try {
			const decoded = await adminAuth.verifySessionCookie(cookie, true);
			event.locals.user = {
				uid: decoded.uid,
				displayName: (decoded.name as string) ?? null,
				email: decoded.email ?? null,
				photoURL: (decoded.picture as string) ?? null,
			};
		} catch {
			// Expired/invalid cookie — clear it and continue as anonymous.
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	const lang = event.locals.lang;
	const dir = getDirection(lang as LanguagesEnum);

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', lang).replace('%dir%', dir),
	});
};
