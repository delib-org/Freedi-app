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

				// If cookies were missing or wrong, refresh the page to update server-side data
				// This ensures admin status is properly checked on the server
				if (needsRefresh) {
					console.info('[AuthSync] Cookies out of sync with auth state, refreshing page', {
						cookieUserId: currentCookieUserId?.substring(0, 10) || 'none',
						authUserId: user.uid.substring(0, 10) + '...',
						isFirstLogin: !isInitialized.current,
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
				console.error('====================================');
				console.error('❌ NO USER SIGNED IN (user = null)');
				const userId = getCookie('userId');
				console.error('🍪 COOKIE USER ID:', userId);
				console.error('====================================');

				// CRITICAL FIX: Only create anonymous user if:
				// 1. We're fully initialized (not first auth check)
				// 2. There's no cookie suggesting an admin session
				// 3. We haven't already attempted anonymous login
				// This prevents race condition where anonymous login overwrites admin session

				if (userId && !isInitialized.current) {
					// Server has auth (cookie) but Client (SDK) is unauthenticated.
					// This often happens during page load while the SDK is still initializing or if the user is an Admin.
					// CRITICAL: Do NOT force anonymous login here, as it would overwrite the valid Admin cookie
					// and effectively log the user out.
					console.info('[AuthSync] Server has auth (cookie) but client is unauthenticated. Preserving cookie session and waiting for auth to initialize.');
					isInitialized.current = true; // Mark as initialized to prevent anonymous login on next cycle
				} else if (!isInitialized.current && !userId && !hasAttemptedAnonymousLogin.current) {
					// Only create anonymous user on FIRST initialization if there's truly no session
					console.info('[AuthSync] No session detected on server or client, signing in anonymously');
					hasAttemptedAnonymousLogin.current = true;
					try {
						await anonymousLogin();
					} catch (error) {
						console.error('[AuthSync] Failed to initialize Firebase Auth:', error);
					}
				} else if (isInitialized.current && !userId && !previousUserId.current && !hasAttemptedAnonymousLogin.current) {
					// User explicitly logged out - create new anonymous session
					console.info('[AuthSync] User logged out, creating new anonymous session');
					hasAttemptedAnonymousLogin.current = true;
					try {
						await anonymousLogin();
					} catch (error) {
						console.error('[AuthSync] Failed to create anonymous session:', error);
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
