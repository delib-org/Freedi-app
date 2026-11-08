/**
 * User management utilities for Sign app
 * Supports both Firebase Auth and anonymous users
 */
import { safeLocalStorage } from './safeStorage';

const USER_ID_KEY = 'signUserId';
const FIREBASE_USER_KEY = 'firebaseUser';

/**
 * Generate a unique anonymous user ID
 */
export function generateAnonymousUserId(): string {
  return `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get or create anonymous user ID (client-side only)
 * This function should only be called in client components
 */
export function getOrCreateAnonymousUser(): string {
  if (typeof window === 'undefined') {
    throw new Error('getOrCreateAnonymousUser can only be called on client-side');
  }

  let userId = safeLocalStorage.getItem(USER_ID_KEY);

  if (!userId) {
    userId = generateAnonymousUserId();
    safeLocalStorage.setItem(USER_ID_KEY, userId);
  }

  return userId;
}

/**
 * Store Firebase user info (client-side)
 */
export function setFirebaseUser(user: { uid: string; displayName: string | null; email: string | null }): void {
  if (typeof window === 'undefined') return;

  // Store in localStorage for client-side access (display purposes only)
  // Do NOT store email — PII should not persist in browser storage
  safeLocalStorage.setItem(FIREBASE_USER_KEY, JSON.stringify({ uid: user.uid, displayName: user.displayName }));
  safeLocalStorage.setItem(USER_ID_KEY, user.uid);

  // Client-readable hints only. The server identifies users by the signed
  // session cookie (src/lib/auth/requestIdentity.ts) and never trusts these.
  document.cookie = `userId=${user.uid}; path=/; max-age=31536000; SameSite=Lax`;
  document.cookie = `userDisplayName=${encodeURIComponent(user.displayName || '')}; path=/; max-age=31536000; SameSite=Lax`;
  // Remove any existing email cookie (PII)
  document.cookie = 'userEmail=; path=/; max-age=0';
}

/**
 * Clear user data on logout (client-side)
 */
export function clearUserData(): void {
  if (typeof window === 'undefined') return;

  safeLocalStorage.removeItem(USER_ID_KEY);
  safeLocalStorage.removeItem(FIREBASE_USER_KEY);

  // Clear cookies
  document.cookie = 'userId=; path=/; max-age=0';
  document.cookie = 'userDisplayName=; path=/; max-age=0';
}

/**
 * Generate a display name for anonymous users
 * @param userId - Anonymous user ID
 */
export function getAnonymousDisplayName(userId: string): string {
  // Extract timestamp from userId for consistent naming
  const match = userId.match(/anon_(\d+)_/);
  if (match) {
    const timestamp = parseInt(match[1]);

    return `User ${timestamp.toString().slice(-6)}`;
  }

  return 'Anonymous User';
}

/**
 * Check if a user ID is anonymous.
 *
 * Detects both localStorage-based anonymous IDs (prefixed with "anon_")
 * and Firebase anonymous users (no email stored in localStorage).
 * Firebase anonymous UIDs look like random strings (e.g., "oBz4MdGtX...")
 * and do NOT have the "anon_" prefix, so we must also check stored user data.
 */
export function isAnonymousUser(userId: string): boolean {
  // Check for localStorage-based anonymous IDs
  if (userId.startsWith('anon_')) return true;

  // Check if there's a stored Firebase user without an email,
  // which indicates a Firebase anonymous auth user
  if (typeof window !== 'undefined') {
    try {
      const storedUser = safeLocalStorage.getItem(FIREBASE_USER_KEY);
      if (storedUser) {
        const parsed = JSON.parse(storedUser) as { uid: string; email: string | null };
        if (parsed.uid === userId && !parsed.email) return true;
      }
    } catch {
      // If parsing fails, fall through to default
    }
  }

  return false;
}

/**
 * User info type for the Sign app
 */
export interface SignUser {
  uid: string;
  displayName: string;
  isAnonymous: boolean;
}
