/**
 * Firebase client: the app and Auth only.
 *
 * Every page loads this file (AuthProvider sits in the root layout), so it
 * deliberately does not touch Firestore, Storage or Functions — together they
 * are ~150KB gzipped. Import those from firestoreClient / storageClient /
 * functionsClient where they are used, or lazily via loadFirestore().
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserPopupRedirectResolver,
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
  browserLocalPersistence,
  connectAuthEmulator,
} from 'firebase/auth';
import { logError } from '../utils/errorHandling';
import { isUserCancelledAuthError, isPopupBlockedAuthError } from './authErrors';
import { CLIENT_EMULATORS, isClientEmulatorMode } from './clientEmulators';

// Firebase client configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase app (singleton pattern)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/**
 * Auth without the default popup/redirect resolver.
 *
 * getAuth() wires in browserPopupRedirectResolver, which downloads Google's
 * auth iframe + gapi (~100KB) on every page load just to check for a redirect
 * result. MC only signs in with a popup, so the resolver is handed to
 * signInWithPopup() instead and loads only when someone actually signs in.
 * Persistence stays browserLocalPersistence, as before, so existing sessions
 * are kept.
 */
function createAuth(): Auth {
  if (typeof window === 'undefined') return getAuth(app);
  try {
    return initializeAuth(app, { persistence: browserLocalPersistence });
  } catch {
    // Already initialized (dev hot reload) - reuse that instance
    return getAuth(app);
  }
}

const auth = createAuth();

if (isClientEmulatorMode()) {
  console.info('[Firebase Client] Development mode - connecting to emulators');
  try {
    connectAuthEmulator(auth, `http://${CLIENT_EMULATORS.host}:${CLIENT_EMULATORS.authPort}`, {
      disableWarnings: true,
    });
  } catch (error) {
    logError(error, { operation: 'firebaseClient.connectAuthEmulator' });
  }
}

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Sign in with Google using popup.
 *
 * Resolves to `null` when the user backed out (closed the popup, or opened a
 * newer one) - that is a normal action, not an error, so it is neither logged
 * nor reported. A blocked popup is rethrown unreported so the caller can tell
 * the user to allow pop-ups. Every other failure is logged and rethrown.
 */
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    console.info('[Firebase] Sign in successful:', result.user.email);
    return result.user;
  } catch (error) {
    if (isUserCancelledAuthError(error)) {
      console.info('[Firebase] Sign in cancelled by user');

      return null;
    }
    if (isPopupBlockedAuthError(error)) {
      console.info('[Firebase] Sign in popup was blocked by the browser');
      throw error;
    }
    logError(error, { operation: 'firebaseClient.signInWithGoogle' });
    throw error;
  }
}

/**
 * Handle the redirect result after Google sign-in (legacy - now using popup)
 * Kept for backwards compatibility
 */
export async function handleRedirectResult(): Promise<{ user: User; token: string } | null> {
  // No longer using redirect flow - using popup instead
  return null;
}

/**
 * Sign out the current user
 */
export async function signOutUser(): Promise<void> {
  try {
    await signOut(auth);
    clearTokenCache();
    // Clear the key older builds persisted, so a downgrade can't resurrect it.
    localStorage.removeItem('firebase_token');
  } catch (error) {
    logError(error, { operation: 'firebaseClient.signOutUser' });
    throw error;
  }
}

/**
 * Token cache to prevent excessive refresh calls.
 * Firebase tokens are valid for ~1 hour; we cache for 5 minutes
 * to avoid hammering the securetoken API.
 */
let cachedToken: string | null = null;
let tokenExpiry = 0;
const TOKEN_CACHE_MS = 5 * 60 * 1000; // 5 minutes

/** Drop the in-memory token so the next read goes back to the SDK. */
export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiry = 0;
}

/**
 * Get the current user's ID token.
 *
 * `user.getIdToken()` already refreshes on its own once the token is close to
 * expiring, so the only thing kept here is a short in-memory cache to avoid
 * hammering the securetoken API.
 *
 * There is deliberately no localStorage fallback. It used to return a token
 * written once at sign-in, which by the time anything fell back to it could be
 * hours old — the server then rejected it as auth/id-token-expired, and the
 * long-running synthesis poll failed exactly that way. A missing token is a
 * recoverable "send them to login"; a stale one is a silent 401.
 *
 * @param options.force - bypass every cache and mint a new token. Use after a
 *   401, where the assumption that the held token is still good was just
 *   disproved by the server.
 */
export async function getCurrentToken(
  options: { force?: boolean } = {}
): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    clearTokenCache();
    return null;
  }

  if (!options.force && cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const token = await user.getIdToken(options.force === true);
    cachedToken = token;
    tokenExpiry = Date.now() + TOKEN_CACHE_MS;
    return token;
  } catch (error) {
    logError(error, {
      operation: 'firebaseClient.getCurrentToken',
      metadata: { forced: options.force === true },
    });
    clearTokenCache();

    return null;
  }
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export { auth, app };
export type { User };
