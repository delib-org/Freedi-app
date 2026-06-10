/**
 * Session cookie mint/clear (§4.3). POST a Firebase client ID token → a
 * server-set `__session` session cookie (httpOnly), so SSR knows the user with
 * zero client Firebase on subsequent first paints. DELETE clears it.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { adminAuth } from '$lib/server/firebaseAdmin';

const SESSION_COOKIE = '__session';
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { idToken } = await request.json();
	if (!idToken) return json({ error: 'Missing idToken' }, { status: 400 });

	try {
		const sessionCookie = await adminAuth.createSessionCookie(idToken, {
			expiresIn: FIVE_DAYS_MS,
		});
		cookies.set(SESSION_COOKIE, sessionCookie, {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: FIVE_DAYS_MS / 1000,
		});

		return json({ success: true });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Failed to create session' },
			{ status: 401 },
		);
	}
};

export const DELETE: RequestHandler = async ({ cookies }) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });

	return json({ success: true });
};
