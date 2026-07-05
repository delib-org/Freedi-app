import { createActivityUrlResolver, type ActivityUrlResolver } from '@freedi/event-core';

/** Studio's activity URL resolver, built from its env-configured base URLs. */
export const activityUrlResolver: ActivityUrlResolver = createActivityUrlResolver({
	mainAppBaseUrl: import.meta.env.VITE_MAIN_APP_URL || 'https://app.wizcol.com',
	massConsensusBaseUrl: import.meta.env.VITE_MASS_CONSENSUS_URL || 'https://mc.wizcol.com',
	signBaseUrl: import.meta.env.VITE_SIGN_APP_URL || 'https://sign.wizcol.com',
});
