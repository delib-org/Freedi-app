/**
 * Exposes the signed-in user (from the session cookie, resolved in
 * hooks.server.ts) to the layout so the header can show sign-in / sign-out.
 */
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	return {
		user: locals.user,
		pathname: url.pathname,
		lang: locals.lang,
	};
};
