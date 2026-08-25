import { createActivityUrlResolver, type ActivityUrlResolver } from '@freedi/event-core';

/** Base URL of the main WizCol app (deliberation / mind-map / admin screens). */
export const MAIN_APP_URL: string = import.meta.env.VITE_MAIN_APP_URL || 'https://app.wizcol.com';

/** Studio's activity URL resolver, built from its env-configured base URLs. */
export const activityUrlResolver: ActivityUrlResolver = createActivityUrlResolver({
	mainAppBaseUrl: MAIN_APP_URL,
	massConsensusBaseUrl: import.meta.env.VITE_MASS_CONSENSUS_URL || 'https://mc.wizcol.com',
	signBaseUrl: import.meta.env.VITE_SIGN_APP_URL || 'https://sign.wizcol.com',
	// wizcol-join.web.app is the live hosting site; join.wizcol.com does not
	// resolve (same default as the main app's getJoinAppUrl).
	joinBaseUrl: import.meta.env.VITE_JOIN_APP_URL || 'https://wizcol-join.web.app',
});
