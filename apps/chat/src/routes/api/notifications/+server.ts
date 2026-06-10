/**
 * In-app notification API. The browser listens to its own notifications live via
 * `onSnapshot` (read-only, allowed by rules); the privileged writes (mark read)
 * happen here through the admin SDK, consistent with the rest of chat.
 *
 *  GET                                  — recent notifications + unread count (SSR first paint)
 *  POST { action: 'markRead', ids[] }   — mark specific notifications read
 *  POST { action: 'markAllRead' }       — mark every notification read
 *
 * All routes require an authenticated session.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import {
	getNotifications,
	getUnreadCount,
	markRead,
	markAllRead,
} from '$lib/server/notificationActions';

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Not authenticated' }, { status: 401 });

	try {
		const [notifications, unreadCount] = await Promise.all([
			getNotifications(user),
			getUnreadCount(user),
		]);

		return json({ notifications, unreadCount });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Failed to read notifications' },
			{ status: 500 },
		);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Not authenticated' }, { status: 401 });

	let body: { action?: string; ids?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	try {
		switch (body.action) {
			case 'markRead': {
				const ids = Array.isArray(body.ids)
					? body.ids.filter((id): id is string => typeof id === 'string')
					: [];
				if (ids.length === 0) return json({ error: 'Missing ids' }, { status: 400 });
				const updated = await markRead(user, ids);

				return json({ success: true, updated });
			}
			case 'markAllRead': {
				const updated = await markAllRead(user);

				return json({ success: true, updated });
			}
			default:
				return json({ error: 'Unknown action' }, { status: 400 });
		}
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Notification action failed' },
			{ status: 500 },
		);
	}
};
