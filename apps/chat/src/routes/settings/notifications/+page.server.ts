/**
 * Loads the user's notification settings for the settings page. Redirects
 * anonymous visitors to sign-in.
 */
import { redirect } from '@sveltejs/kit';
import { getNotificationSettings } from '$lib/server/settingsActions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, `/signin?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const settings = await getNotificationSettings(locals.user);

	return { settings };
};
