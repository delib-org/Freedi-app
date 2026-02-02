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
	const hasAttemptedAnonymousLogin = useRef(false);
	const authRestoreTimeout = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		const auth = getFirebaseAuth();

		console.error('====================================');
		console.error('🚀 AuthSync STARTED');
		console.error('====================================');

		// Subscribe to auth state changes (don't unsubscribe - keep monitoring)
		const unsubscribe = auth.onAuthStateChanged(async (user) => {
			console.error('====================================');
			console.error('🔄 AUTH STATE CHANGED');
			console.error('====================================');

			// Clear any pending auth restore timeout
			if (authRestoreTimeout.current) {
				clearTimeout(authRestoreTimeout.current);
				authRestoreTimeout.current = null;
			}

			if (user) {
				// LOG FULL USER ID IN BROWSER CONSOLE
				console.error('====================================');
				console.error('✅ USER IS SIGNED IN:');
				console.error('🔑 USER ID (FULL):', user.uid);
				console.error('📧 EMAIL:', user.email);
				console.error('👤 DISPLAY NAME:', user.displayName);
				console.error('🆔 IS ANONYMOUS:', user.isAnonymous);
				console.error('====================================');
				// User is signed in - ensure cookies are up to date
				const currentCookieUserId = getCookie('userId');
				const needsRefresh = currentCookieUserId !== user.uid;

				// Update cookies to keep them fresh
				setCookiesFromUser(user);

				// IMPORTANT: Only reload for authenticated (non-anonymous) users
				// Anonymous users don't need server-side admin checks, so no reload needed
				// Admins (Google users) need reload so server can check permissions
				if (needsRefresh && !user.isAnonymous) {
					console.info('[AuthSync] Authenticated user cookies out of sync, refreshing to sync server permissions', {
						cookieUserId: currentCookieUserId?.substring(0, 10) || 'none',
						authUserId: user.uid.substring(0, 10) + '...',
						isFirstLogin: !isInitialized.current,
					});
					// Small delay to ensure cookies are set
					setTimeout(() => {
						window.location.reload();
					}, 100);

					return; // Don't continue - page will reload
				} else if (needsRefresh && user.isAnonymous) {
					console.info('[AuthSync] Anonymous user logged in, cookies updated (no reload needed)', {
						userId: user.uid.substring(0, 10) + '...'
					});
				}

				previousUserId.current = user.uid;
				isInitialized.current = true;
			} else {
				// No user signed in
				console.error('====================================');
				console.error('❌ NO USER SIGNED IN (user = null)');
				const userId = getCookie('userId');
				console.error('🍪 COOKIE USER ID:', userId);
				console.error('====================================');

				// SMART DETECTION: Differentiate between new visitors and returning admins

				if (userId && !isInitialized.current) {
					// Cookie exists but no user yet - this is a RETURNING USER
					// Firebase Auth might still be restoring the session
					// WAIT for auth to restore before creating anonymous user
					console.info('[AuthSync] Cookie detected - waiting for auth to restore session...', {
						cookieUserId: userId.substring(0, 10) + '...'
					});

					// Give auth 2 seconds to restore
					// If auth doesn't restore in 2 seconds, cookie is stale → create anonymous
					authRestoreTimeout.current = setTimeout(async () => {
						if (!auth.currentUser && !hasAttemptedAnonymousLogin.current) {
							console.info('[AuthSync] Auth did not restore after 2s - cookie is stale, creating anonymous user');
							hasAttemptedAnonymousLogin.current = true;
							try {
								await anonymousLogin();
							} catch (error) {
								console.error('[AuthSync] Failed to create anonymous session after timeout:', error);
							}
						}
					}, 2000);

					isInitialized.current = true;
				} else if (!userId && !isInitialized.current && !hasAttemptedAnonymousLogin.current) {
					// NO cookie and first auth check - this is a NEW VISITOR
					// Create anonymous user IMMEDIATELY (no need to wait)
					console.info('[AuthSync] No cookie detected - new visitor, creating anonymous session immediately');
					hasAttemptedAnonymousLogin.current = true;
					try {
						await anonymousLogin();
					} catch (error) {
						console.error('[AuthSync] Failed to create anonymous session:', error);
					}
					isInitialized.current = true;
				} else if (isInitialized.current && !userId && previousUserId.current && !hasAttemptedAnonymousLogin.current) {
					// User WAS logged in (previousUserId exists) but now isn't (no cookie, no user)
					// This means they logged out - create new anonymous session
					console.info('[AuthSync] User logged out, creating new anonymous session');
					hasAttemptedAnonymousLogin.current = true;
					try {
						await anonymousLogin();
					} catch (error) {
						console.error('[AuthSync] Failed to create anonymous session after logout:', error);
					}
				}

				previousUserId.current = null;
				isInitialized.current = true;
			}
		});

		// Cleanup
		return () => {
			unsubscribe();
			if (authRestoreTimeout.current) {
				clearTimeout(authRestoreTimeout.current);
			}
		};

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
