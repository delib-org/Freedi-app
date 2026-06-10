/**
 * Persists the signed-in user's chosen UI language onto their user document
 * (`usersV2.defaultLanguage`), so the choice is remembered across devices and
 * restored on first paint by `hooks.server.ts`. Anonymous callers are rejected;
 * the client still keeps the cookie/localStorage copy for SSR either way.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { Collections } from '@freedi/shared-types';
import { isValidLanguage } from '@freedi/shared-i18n';
import { adminDb } from '$lib/server/firebaseAdmin';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Not authenticated' }, { status: 401 });

	const { lang } = await request.json();
	if (typeof lang !== 'string' || !isValidLanguage(lang)) {
		return json({ error: 'Invalid language' }, { status: 400 });
	}

	try {
		await adminDb
			.collection(Collections.users)
			.doc(user.uid)
			.set({ defaultLanguage: lang }, { merge: true });

		return json({ success: true });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Failed to save language' },
			{ status: 500 },
		);
	}
};
