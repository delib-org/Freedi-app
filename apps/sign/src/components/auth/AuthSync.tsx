'use client';

import { useEffect, useState } from 'react';
import { getFirebaseAuth, anonymousLogin } from '@/lib/firebase/client';

/**
 * AuthSync Component
 *
 * Ensures Firebase Auth client is initialized when user has server-side auth (cookies).
 * This is needed because Next.js uses cookies for SSR, but Firestore security rules
 * need the Firebase Auth client to be authenticated.
 */
export function AuthSync() {
	const [isInitialized, setIsInitialized] = useState(false);

	useEffect(() => {
		const initAuth = async () => {
			try {
				const auth = getFirebaseAuth();

				// Wait for auth state to be determined
				const unsubscribe = auth.onAuthStateChanged(async (user) => {
					if (user) {
						// Already signed in, Firestore security rules will work
						setIsInitialized(true);
						unsubscribe();
					} else {
						// Check if server knows we're authenticated (via cookies)
						const userId = getCookie('userId');

						if (userId) {
							// Server has auth but client doesn't - sync them
							// Sign in anonymously to Firebase Auth
							// This gives Firestore security rules the auth context they need
							try {
								await anonymousLogin();
								setIsInitialized(true);
							} catch (error) {
								console.error('[AuthSync] Failed to initialize Firebase Auth:', error);
							}
						} else {
							// No auth on server or client
							setIsInitialized(true);
						}

						unsubscribe();
					}
				});
			} catch (error) {
				console.error('[AuthSync] Error initializing auth:', error);
				setIsInitialized(true);
			}
		};

		initAuth();
	}, []);

	// This component doesn't render anything
	return null;
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
