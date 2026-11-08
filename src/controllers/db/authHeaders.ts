import { auth } from './config';
import { AuthenticationError } from '@/utils/errorHandling';

/**
 * Headers for HTTP Cloud Functions, which verify a Firebase ID token and take the
 * caller's identity from it. Anonymous users have tokens too.
 *
 * Waits for auth to restore first: on a page load `currentUser` is null for a
 * moment, and a request sent in that gap would be refused with a 401.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
	await auth.authStateReady();
	const idToken = await auth.currentUser?.getIdToken();
	if (!idToken) {
		throw new AuthenticationError('User not authenticated', {
			operation: 'authHeaders.getAuthHeaders',
		});
	}

	return {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${idToken}`,
	};
}
