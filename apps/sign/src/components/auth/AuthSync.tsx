'use client';

import { useEffect, useRef } from 'react';
import { getFirebaseAuth, anonymousLogin } from '@/lib/firebase/client';

/**
 * AuthSync Component
 *
 * Ensures Firebase Auth client is initialized and cookies are kept in sync.
 * This is needed because Next.js uses cookies for SSR, but Firestore security rules
 * need the Firebase Auth client to be authenticated.
 *
 * Key features:
 * - Continuously monitors Firebase Auth state changes
 * - Updates cookies whenever auth state changes
 * - Syncs client auth with server cookies
 * - Refreshes page when user authenticates to update admin status
 */
export function AuthSync() {
	const isInitialized = useRef(false);
	const previousUserId = useRef<string | null>(null);

	useEffect(() => {
		const auth = getFirebaseAuth();

		// Subscribe to auth state changes (don't unsubscribe - keep monitoring)
		const unsubscribe = auth.onAuthStateChanged(async (user) => {
			if (user) {
				// User is signed in - ensure cookies are up to date
				const currentCookieUserId = getCookie('userId');
				const needsRefresh = currentCookieUserId !== user.uid;

				// Update cookies to keep them fresh
				setCookiesFromUser(user);

				// If cookies were missing or wrong, refresh the page to update server-side data
				// This ensures admin status is properly checked on the server
				if (needsRefresh) {
					console.info('[AuthSync] Cookies out of sync with auth state, refreshing page', {
						cookieUserId: currentCookieUserId?.substring(0, 10),
						authUserId: user.uid.substring(0, 10) + '...',
					});
					// Small delay to ensure cookies are set
					setTimeout(() => {
						window.location.reload();
					}, 100);

					return; // Don't continue - page will reload
				}

				previousUserId.current = user.uid;
				isInitialized.current = true;
			} else {
				// No user signed in
				const userId = getCookie('userId');

				if (userId && !isInitialized.current) {
					// Server has auth but client doesn't - sync them
					console.info('[AuthSync] Server has auth but client doesnt, signing in anonymously');
					try {
						await anonymousLogin();
					} catch (error) {
						console.error('[AuthSync] Failed to initialize Firebase Auth:', error);
					}
				}

				previousUserId.current = null;
				isInitialized.current = true;
			}
		});

		// Periodically refresh cookies for authenticated users to prevent expiration
		// Check every 6 hours and refresh cookies if user is still authenticated
		const cookieRefreshInterval = setInterval(() => {
			const user = auth.currentUser;
			if (user) {
				console.info('[AuthSync] Periodic cookie refresh');
				setCookiesFromUser(user);
			}
		}, 6 * 60 * 60 * 1000); // 6 hours

		// Cleanup subscription and interval on unmount
		return () => {
			unsubscribe();
			clearInterval(cookieRefreshInterval);
		};
	}, []);

	// This component doesn't render anything
	return null;
}

/**
 * Set cookies from Firebase user for server-side access
 */
function setCookiesFromUser(user: { uid: string; displayName?: string | null; email?: string | null }): void {
	const maxAge = 60 * 60 * 24 * 30; // 30 days

	document.cookie = `userId=${user.uid}; path=/; max-age=${maxAge}; SameSite=Lax`;

	if (user.displayName) {
		document.cookie = `userDisplayName=${encodeURIComponent(user.displayName)}; path=/; max-age=${maxAge}; SameSite=Lax`;
	}

	if (user.email) {
		document.cookie = `userEmail=${encodeURIComponent(user.email)}; path=/; max-age=${maxAge}; SameSite=Lax`;
	}

	console.info('[AuthSync] Updated cookies for user', {
		userId: user.uid.substring(0, 10) + '...',
		hasDisplayName: !!user.displayName,
		hasEmail: !!user.email,
	});
}

/**
 * Get cookie value by name
 */
function getCookie(name: string): string | null {
	if (typeof document === 'undefined') return null;

	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);

	if (parts.length === 2) {
		return parts.pop()?.split(';').shift() || null;
	}

	return null;
}
