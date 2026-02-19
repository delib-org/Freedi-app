'use client';

import { useEffect, useRef } from 'react';
import { getFirebaseAuth, anonymousLogin } from '@/lib/firebase/client';
import { logError } from '@/lib/utils/errorHandling';

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
	const hasAttemptedAnonymousLogin = useRef(false);
	const isCreatingAnonymousRef = useRef(false);
	const isMountedRef = useRef(true);
	const authRestoreTimeout = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		isMountedRef.current = true;
		const auth = getFirebaseAuth();

		/**
		 * Safe anonymous login with mutual exclusion.
		 * Prevents concurrent calls and skips if component is unmounted.
		 */
		const safeAnonymousLogin = async (context: string): Promise<void> => {
			if (isCreatingAnonymousRef.current || !isMountedRef.current) return;
			isCreatingAnonymousRef.current = true;
			try {
				await anonymousLogin();
			} catch (error) {
				logError(error, {
					operation: 'AuthSync.safeAnonymousLogin',
					metadata: { context },
				});
			} finally {
				isCreatingAnonymousRef.current = false;
			}
		};

		// Subscribe to auth state changes (don't unsubscribe - keep monitoring)
		const unsubscribe = auth.onAuthStateChanged(async (user) => {
			if (!isMountedRef.current) return;

			// Clear any pending auth restore timeout
			if (authRestoreTimeout.current) {
				clearTimeout(authRestoreTimeout.current);
				authRestoreTimeout.current = null;
			}

			if (user) {
				// User is signed in - ensure cookies are up to date
				const currentCookieUserId = getCookie('userId');
				const needsRefresh = currentCookieUserId !== user.uid;

				// Update cookies to keep them fresh
				setCookiesFromUser(user);

				// IMPORTANT: Only reload for authenticated (non-anonymous) users
				// Anonymous users don't need server-side admin checks, so no reload needed
				// Admins (Google users) need reload so server can check permissions
				// EXCEPTION: Don't reload on login page - it handles its own redirect
				const isOnLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';

				if (needsRefresh && !user.isAnonymous && !isOnLoginPage) {
					// Small delay to ensure cookies are set
					setTimeout(() => {
						if (isMountedRef.current) {
							window.location.reload();
						}
					}, 100);

					return; // Don't continue - page will reload
				}

				previousUserId.current = user.uid;
				isInitialized.current = true;
			} else {
				// No user signed in
				const userId = getCookie('userId');

				// SMART DETECTION: Differentiate between new visitors and returning admins

				if (userId && !isInitialized.current) {
					// Cookie exists but no user yet - this is a RETURNING USER
					// Firebase Auth might still be restoring the session
					// WAIT for auth to restore before creating anonymous user

					// Give auth 2 seconds to restore
					// If auth doesn't restore in 2 seconds, cookie is stale -> create anonymous
					authRestoreTimeout.current = setTimeout(async () => {
						if (!auth.currentUser && !hasAttemptedAnonymousLogin.current) {
							hasAttemptedAnonymousLogin.current = true;
							await safeAnonymousLogin('timeout');
						}
					}, 2000);

					isInitialized.current = true;
				} else if (!userId && !isInitialized.current && !hasAttemptedAnonymousLogin.current) {
					// NO cookie and first auth check - this is a NEW VISITOR
					// Create anonymous user IMMEDIATELY (no need to wait)
					hasAttemptedAnonymousLogin.current = true;
					await safeAnonymousLogin('new visitor');
					isInitialized.current = true;
				} else if (isInitialized.current && !userId && previousUserId.current) {
					// User WAS logged in (previousUserId exists) but now isn't (no cookie, no user)
					// This means they logged out - create new anonymous session
					// Note: We do NOT check hasAttemptedAnonymousLogin here because each
					// logout should trigger a fresh anonymous session. The safeAnonymousLogin
					// mutex prevents concurrent calls.
					await safeAnonymousLogin('after logout');
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
				setCookiesFromUser(user);
			}
		}, 6 * 60 * 60 * 1000); // 6 hours

		// Cleanup subscription and interval on unmount
		return () => {
			isMountedRef.current = false;
			unsubscribe();
			clearInterval(cookieRefreshInterval);
			if (authRestoreTimeout.current) {
				clearTimeout(authRestoreTimeout.current);
			}
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
