import { createActivityUrlResolver, type ActivityUrlResolver } from '@freedi/event-core';
import { getMassConsensusUrl } from '@/controllers/db/config';

/**
 * Event Control Center — main-app activity URL resolver.
 *
 * The URL-building logic lives in `@freedi/event-core`; this thin wrapper feeds
 * it the main app's deployment base URLs (origin + the MC/sign helpers) so the
 * main app and Studio produce identical deep-links without duplicating logic.
 */

export type { ActivityLink, ActivityUrlResolver } from '@freedi/event-core';

const SIGN_APP_BASE_URL = import.meta.env.VITE_SIGN_APP_URL || 'https://sign.wizcol.com';

export function getMainAppResolver(): ActivityUrlResolver {
	const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';

	return createActivityUrlResolver({
		mainAppBaseUrl: origin,
		massConsensusBaseUrl: getMassConsensusUrl(),
		signBaseUrl: SIGN_APP_BASE_URL,
	});
}
