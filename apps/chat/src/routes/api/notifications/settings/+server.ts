/**
 * Notification settings API (admin SDK writes).
 *  GET                 — the user's settings (seeded defaults if none).
 *  POST { patch, tz? } — merge a partial settings update.
 *
 * Requires an authenticated session.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import {
	getNotificationSettings,
	updateNotificationSettings,
	type NotificationSettingsPatch,
} from '$lib/server/settingsActions';

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Not authenticated' }, { status: 401 });

	const tz = url.searchParams.get('tz') ?? 'UTC';
	try {
		const settings = await getNotificationSettings(user, tz);

		return json({ settings });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Failed to read settings' },
			{ status: 500 },
		);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Not authenticated' }, { status: 401 });

	let body: { patch?: NotificationSettingsPatch };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (!body.patch || typeof body.patch !== 'object') {
		return json({ error: 'Missing patch' }, { status: 400 });
	}

	try {
		const settings = await updateNotificationSettings(user, body.patch);

		return json({ success: true, settings });
	} catch (e) {
		return json(
			{ error: e instanceof Error ? e.message : 'Failed to update settings' },
			{ status: 500 },
		);
	}
};
