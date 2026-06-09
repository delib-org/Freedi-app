/**
 * Web-push API. The client mints the FCM token in the browser (the only place
 * it can) and posts it here; the privileged Firestore writes happen server-side
 * via the admin SDK.
 *
 *  POST { action: 'register' }                  — store token + sync to existing subs
 *  POST { action: 'follow',   statementId }     — follow a question for push
 *  POST { action: 'unfollow', statementId }     — stop push for a question
 *  GET  ?statementId=...                         — current follow status
 *
 * All routes require an authenticated session.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import {
	registerToken,
	followQuestion,
	unfollowQuestion,
	getFollowStatus,
} from '$lib/server/pushActions';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Not authenticated' }, { status: 401 });

	let body: { action?: string; statementId?: string; token?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { action, statementId, token } = body;
	if (!token) return json({ error: 'Missing token' }, { status: 400 });

	try {
		switch (action) {
			case 'register': {
				const synced = await registerToken(user, token);

				return json({ success: true, subscriptionsSynced: synced });
			}
			case 'follow': {
				if (!statementId) return json({ error: 'Missing statementId' }, { status: 400 });
				await followQuestion(user, statementId, token);

				return json({ success: true, following: true });
			}
			case 'unfollow': {
				if (!statementId) return json({ error: 'Missing statementId' }, { status: 400 });
				await unfollowQuestion(user, statementId, token);

				return json({ success: true, following: false });
			}
			default:
				return json({ error: 'Unknown action' }, { status: 400 });
		}
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'Push action failed' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url, locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Not authenticated' }, { status: 401 });

	const statementId = url.searchParams.get('statementId');
	if (!statementId) return json({ error: 'Missing statementId' }, { status: 400 });

	try {
		const following = await getFollowStatus(user, statementId);

		return json({ following });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Failed to read status' },
			{ status: 500 },
		);
	}
};
