/**
 * Resolves `locals.user` from the `__session` cookie on every request, so
 * `+page.server.ts` loaders/actions know who is signed in without any client
 * Firebase. The cookie is a Firebase **session cookie** minted by
 * `routes/api/session/+server.ts` from a client ID token.
 */
import type { Handle } from '@sveltejs/kit';
import { adminAuth } from '$lib/server/firebaseAdmin';

const SESSION_COOKIE = '__session';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

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

	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%lang%', 'en').replace('%dir%', 'ltr'),
	});
};
