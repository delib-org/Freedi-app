/**
 * Visitor ID utilities for anonymous user tracking
 * Uses localStorage to persist a unique visitor ID across sessions
 */

const STORAGE_KEY = 'freedi_visitor_id';

/**
 * Get or create a visitor ID for anonymous users
 * Returns empty string on server-side
 */
export function getVisitorId(): string {
	if (typeof window === 'undefined') return '';

	let visitorId = localStorage.getItem(STORAGE_KEY);

	if (!visitorId) {
		visitorId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
		localStorage.setItem(STORAGE_KEY, visitorId);
	}

	return visitorId;
}

/**
 * Get user ID from cookie (for authenticated users)
 * Returns null if not authenticated
 */
export function getUserIdFromCookie(): string | null {
	if (typeof document === 'undefined') return null;

	const cookies = document.cookie.split(';');
	for (const cookie of cookies) {
		const [name, value] = cookie.trim().split('=');
		if (name === 'userId') {
			return value;
		}
	}

	return null;
}

/**
 * Get the effective user/visitor ID
 * Returns userId if authenticated, otherwise generates/retrieves visitorId
 */
export function getEffectiveUserId(): string {
	const userId = getUserIdFromCookie();
	return userId || getVisitorId();
}

/**
 * Check if the current user is anonymous
 */
export function isAnonymousUser(): boolean {
	return getUserIdFromCookie() === null;
}
