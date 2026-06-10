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
	setQuestionFrequency,
	getSubscriptionState,
	type SubscriptionState,
} from '$lib/server/pushActions';

const VALID_STATES: SubscriptionState[] = ['unsubscribed', 'instant', 'daily', 'weekly', 'muted'];

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Not authenticated' }, { status: 401 });

	let body: { action?: string; statementId?: string; token?: string; state?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { action, statementId, token, state } = body;

	// setFrequency is the only action that may run without a token (e.g. daily/mute).
	if (action !== 'setFrequency' && !token) {
		return json({ error: 'Missing token' }, { status: 400 });
	}

	try {
		switch (action) {
			case 'register': {
				const synced = await registerToken(user, token as string);

				return json({ success: true, subscriptionsSynced: synced });
			}
			case 'follow': {
				if (!statementId) return json({ error: 'Missing statementId' }, { status: 400 });
				await followQuestion(user, statementId, token as string);

				return json({ success: true, following: true });
			}
			case 'unfollow': {
				if (!statementId) return json({ error: 'Missing statementId' }, { status: 400 });
				await unfollowQuestion(user, statementId, token);

				return json({ success: true, following: false });
			}
			case 'setFrequency': {
				if (!statementId) return json({ error: 'Missing statementId' }, { status: 400 });
				if (!state || !VALID_STATES.includes(state as SubscriptionState)) {
					return json({ error: 'Invalid state' }, { status: 400 });
				}
				await setQuestionFrequency(user, statementId, state as SubscriptionState, token);

				return json({ success: true, state });
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
		if (url.searchParams.get('detail') === 'state') {
			const state = await getSubscriptionState(user, statementId);

			return json({ state });
		}
		const following = await getFollowStatus(user, statementId);

		return json({ following });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Failed to read status' },
			{ status: 500 },
		);
	}
};
