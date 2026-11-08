/**
 * Remembers, per device, that an FCM token was already synced into the user's
 * subscriptions, so app start does not re-query every subscription.
 */

import { NOTIFICATION, STORAGE_KEYS } from '@/constants/common';

interface TokenSyncMarker {
	userId: string;
	token: string;
	syncedAt: number;
}

const isMarker = (value: unknown): value is TokenSyncMarker => {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Partial<TokenSyncMarker>;

	return (
		typeof candidate.userId === 'string' &&
		typeof candidate.token === 'string' &&
		typeof candidate.syncedAt === 'number'
	);
};

/**
 * True when this device synced the same token for the same user within the resync interval.
 * Any storage failure counts as "not synced recently".
 */
export const wasTokenSyncedRecently = (userId: string, token: string): boolean => {
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.FCM_TOKEN_SYNC);
		if (!raw) return false;

		const marker: unknown = JSON.parse(raw);
		if (!isMarker(marker)) return false;

		const age = Date.now() - marker.syncedAt;

		return (
			marker.userId === userId &&
			marker.token === token &&
			age >= 0 &&
			age < NOTIFICATION.TOKEN_RESYNC_INTERVAL
		);
	} catch {
		return false;
	}
};

export const markTokenSynced = (userId: string, token: string): void => {
	try {
		const marker: TokenSyncMarker = { userId, token, syncedAt: Date.now() };
		localStorage.setItem(STORAGE_KEYS.FCM_TOKEN_SYNC, JSON.stringify(marker));
	} catch {
		// Storage unavailable: next start simply syncs again.
	}
};

export const clearTokenSyncMarker = (): void => {
	try {
		localStorage.removeItem(STORAGE_KEYS.FCM_TOKEN_SYNC);
	} catch {
		// Nothing to clear.
	}
};
