import m from 'mithril';
import {
  auth,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
  signInWithRedirect,
  linkWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  User,
} from './firebase';

/**
 * Identity tiers:
 * 0 = Anonymous (participated, data saved with anon ID)
 * 1 = Email (can receive notifications) — future
 * 2 = Google Auth (full return journey, push notifications)
 */
export type IdentityTier = 0 | 1 | 2;

export interface UserState {
  user: User | null;
  tier: IdentityTier;
  loading: boolean;
}

const state: UserState = {
  user: null,
  tier: 0,
  loading: true,
};

// Resolves once Firebase has determined the initial auth state
// (either restored from persistence or null).
let _resolveAuthReady: () => void;
const authReadyPromise = new Promise<void>((resolve) => {
  _resolveAuthReady = resolve;
});

/** Get current user state (read-only) */
export function getUserState(): Readonly<UserState> {
  return state;
}

/** Wait for Firebase to settle auth (persisted session or redirect result) */
export function waitForAuthReady(): Promise<void> {
  return authReadyPromise;
}

/**
 * Ensure there is a signed-in user.
 * Waits for auth to settle first — so after a Google redirect the restored
 * Google user is used instead of creating a new anonymous user.
 */
export async function ensureUser(): Promise<User> {
  await waitForAuthReady();

  // If Firebase restored a persisted user (Google or anonymous), use it.
  if (auth.currentUser) {
    return auth.currentUser;
  }

  // No persisted user — sign in anonymously.
  const credential = await signInAnonymously(auth);
  return credential.user;
}

/**
 * Upgrade to Google Auth (Tier 2) — uses redirect to avoid popup-blocked.
 * After calling this, the page will redirect to Google's sign-in page.
 * When the user returns, `initAuth` picks up the result via `getRedirectResult`.
 */
export async function upgradeToGoogle(): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('No current user to upgrade');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    // Try to link anonymous account with Google via popup
    await linkWithPopup(currentUser, provider);
    state.tier = 2;
    m.redraw();
  } catch (error: unknown) {
    const firebaseError = error as { code?: string };
    if (firebaseError.code === 'auth/credential-already-in-use') {
      // Account already exists — sign in directly via popup
      await signInWithPopup(auth, provider);
      state.tier = 2;
      m.redraw();
    } else {
      throw error;
    }
  }
}

/** Initialize auth listener and handle redirect result */
export function initAuth(): void {
  let authStateSettled = false;

  // 1. Handle redirect result (runs once after Google redirects back).
  //    This must be called before onAuthStateChanged sets up a listener,
  //    so that Firebase can process the pending credential.
  getRedirectResult(auth)
    .then((result) => {
      if (result) {
        state.tier = 2;
        _returnedFromRedirect = sessionStorage.getItem('flow_auth_upgrading') === '1';
        sessionStorage.removeItem('flow_auth_upgrading');
        m.redraw();
      }
    })
    .catch((error: unknown) => {
      console.error('[Auth] Redirect result error:', error);
      sessionStorage.removeItem('flow_auth_upgrading');

      // If link failed because credential already in use, try direct sign-in
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/credential-already-in-use') {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        signInWithRedirect(auth, provider).catch((err: unknown) => {
          console.error('[Auth] Fallback redirect failed:', err);
        });
      }
    });

  // 2. Listen for auth state changes.
  //    The FIRST callback tells us Firebase has determined the user state
  //    (from persistence or from the redirect above).
  onAuthStateChanged(auth, (user: User | null) => {
    state.user = user;
    state.loading = false;

    if (user) {
      state.tier = user.isAnonymous ? 0 : 2;
    } else {
      state.tier = 0;
    }

    // Resolve the "auth ready" promise on the first callback.
    if (!authStateSettled) {
      authStateSettled = true;
      _resolveAuthReady();
    }

    m.redraw();
  });
}

/**
 * Sign in with Google from the Home screen.
 * Handles all scenarios:
 * - Anonymous user (Tier 0) → linkWithRedirect to merge anon account
 * - No user yet → signInWithRedirect directly
 * - Already Google (Tier 2) → no-op
 */
export async function signInWithGoogle(): Promise<void> {
  if (state.tier === 2) return; // Already signed in with Google

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const currentUser = auth.currentUser;

  if (currentUser && currentUser.isAnonymous) {
    // Tier 0 anonymous → link with Google
    try {
      await linkWithPopup(currentUser, provider);
      state.tier = 2;
      m.redraw();
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/credential-already-in-use') {
        await signInWithPopup(auth, provider);
        state.tier = 2;
        m.redraw();
      } else {
        throw error;
      }
    }
  } else {
    // No user yet → direct Google sign-in
    await signInWithPopup(auth, provider);
    state.tier = 2;
    m.redraw();
  }
}

/**
 * True once when the user has just returned from a successful Google redirect.
 * Stays true until `consumeRedirectReturn()` is called, so that views
 * can read it after the redraw triggered by `getRedirectResult`.
 */
let _returnedFromRedirect = false;

/** Check if we just returned from a successful Google redirect */
export function didReturnFromRedirect(): boolean {
  return _returnedFromRedirect;
}

/** Consume the redirect-return flag (call after acting on it) */
export function consumeRedirectReturn(): void {
  _returnedFromRedirect = false;
}

/** Check if a redirect is in progress (page hasn't reloaded yet) */
export function isReturningFromRedirect(): boolean {
  return sessionStorage.getItem('flow_auth_upgrading') === '1';
}
