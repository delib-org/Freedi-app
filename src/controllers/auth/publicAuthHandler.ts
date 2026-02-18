/**
 * Public Authentication Handler
 * Handles automatic authentication for users accessing public statements
 * Tries Google silent sign-in first, falls back to anonymous with temporal names
 */

import {
	signInAnonymously,
	signInWithPopup,
	GoogleAuthProvider,
	updateProfile,
	linkWithCredential,
	User,
	AuthCredential,
} from 'firebase/auth';
import { auth } from '@/controllers/db/config';
import { generateTemporalName } from '@/utils/temporalNameGenerator';
import { setUserToDB } from '@/controllers/db/user/setUser';
import { convertFirebaseUserToCreator } from '@/types/user/userUtils';

/**
 * Attempts to silently sign in with Google if user has previous session
 * @returns true if successful, false otherwise
 */
async function trySilentGoogleSignIn(): Promise<boolean> {
	try {
		// Check if user previously signed in with Google
		const lastAuthProvider = localStorage.getItem('lastAuthProvider');
		if (lastAuthProvider !== 'google.com') {
			return false;
		}

		// Attempt silent sign-in with Google
		const provider = new GoogleAuthProvider();
		provider.setCustomParameters({
			prompt: 'none', // Don't show account chooser
			login_hint: localStorage.getItem('lastGoogleEmail') || undefined,
		});

		const result = await signInWithPopup(auth, provider);

		// Store successful login info
		localStorage.setItem('lastAuthProvider', 'google.com');
		if (result.user.email) {
			localStorage.setItem('lastGoogleEmail', result.user.email);
		}

		console.info('Silent Google sign-in successful');

		return true;
	} catch {
		// Silent sign-in failed - this is expected if user hasn't signed in before
		console.info('Silent Google sign-in not available, will use anonymous');

		return false;
	}
}

/**
 * Creates an anonymous user with a temporal name
 * @returns The created anonymous user
 */
async function createAnonymousUser(): Promise<User> {
	try {
		// Sign in anonymously
		const result = await signInAnonymously(auth);
		const user = result.user;

		// Generate and assign temporal name
		const temporalName = generateTemporalName();

		// Update the user's display name
		await updateProfile(user, {
			displayName: temporalName,
		});

		// Store anonymous session info
		sessionStorage.setItem('temporalName', temporalName);
		sessionStorage.setItem('isAnonymousUser', 'true');
		localStorage.setItem('lastAuthProvider', 'anonymous');

		// Save the user to the database with the temporal name
		const creator = convertFirebaseUserToCreator(user);
		await setUserToDB(creator);

		console.info(`Anonymous user created with name: ${temporalName}`);

		return user;
	} catch (error) {
		console.error('Failed to create anonymous user:', error);
		throw error;
	}
}

/**
 * Main function to handle public authentication
 * Called when accessing a public statement without authentication
 * @returns Promise that resolves when authentication is complete
 */
export async function handlePublicAutoAuth(): Promise<void> {
	try {
		// Check if already authenticated
		if (auth.currentUser) {
			console.info('User already authenticated, skipping auto-auth');

			return;
		}

		// Try silent Google sign-in first
		const googleSignInSuccess = await trySilentGoogleSignIn();

		if (googleSignInSuccess) {
			return; // Successfully signed in with Google
		}

		// Fall back to anonymous authentication
		await createAnonymousUser();
	} catch (error) {
		console.error('Public auto-authentication failed:', error);
		// Don't throw - let the user see the content even if auth fails
		// The useAuthorization hook will handle the lack of authentication
	}
}

/**
 * Checks if the current user is anonymous
 * @returns true if user is anonymous, false otherwise
 */
export function isAnonymousUser(): boolean {
	if (!auth.currentUser) return false;

	return auth.currentUser.isAnonymous;
}

/**
 * Gets the temporal name of the current anonymous user
 * @returns The temporal name or null if not anonymous
 */
export function getTemporalName(): string | null {
	if (!isAnonymousUser()) return null;

	return sessionStorage.getItem('temporalName');
}

/**
 * Upgrades an anonymous user to a permanent account
 * This allows them to keep their contributions
 * @param credential - The credential to link (Google, email/password, etc.)
 */
export async function upgradeAnonymousUser(credential: AuthCredential): Promise<void> {
	if (!auth.currentUser?.isAnonymous) {
		throw new Error('Current user is not anonymous');
	}

	try {
		// Link the anonymous account with the credential
		await linkWithCredential(auth.currentUser, credential);

		// Clear anonymous session data
		sessionStorage.removeItem('temporalName');
		sessionStorage.removeItem('isAnonymousUser');

		// Update auth provider info
		localStorage.setItem('lastAuthProvider', credential.providerId);

		console.info('Anonymous user successfully upgraded');
	} catch (error) {
		console.error('Failed to upgrade anonymous user:', error);
		throw error;
	}
}
