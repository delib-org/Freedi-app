/**
 * User management utilities for Sign app
 * Supports both Firebase Auth and anonymous users
 */

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

  let userId = localStorage.getItem(USER_ID_KEY);

  if (!userId) {
    userId = generateAnonymousUserId();
    localStorage.setItem(USER_ID_KEY, userId);
  }

  // Cookie is now set by middleware (HttpOnly _uid cookie)
  // Legacy userId cookie also set by middleware on first visit

  return userId;
}

/**
 * Store Firebase user info (client-side)
 */
export function setFirebaseUser(user: { uid: string; displayName: string | null; email: string | null }): void {
  if (typeof window === 'undefined') return;

  // Store in localStorage for client-side access (display purposes only)
  // Do NOT store email — PII should not persist in browser storage
  localStorage.setItem(FIREBASE_USER_KEY, JSON.stringify({ uid: user.uid, displayName: user.displayName }));
  localStorage.setItem(USER_ID_KEY, user.uid);

  // Set legacy cookies for server-side access
  // The authoritative _uid HttpOnly cookie is set by middleware
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

  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(FIREBASE_USER_KEY);

  // Clear cookies
  document.cookie = 'userId=; path=/; max-age=0';
  document.cookie = 'userDisplayName=; path=/; max-age=0';
}

/**
 * Get user ID from cookies (server-side)
 * @param cookieHeader - Cookie header from request
 */
/**
 * Prefers the HttpOnly _uid cookie (set by middleware, XSS-proof)
 * over the legacy userId cookie.
 */
export function getUserIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  // Prefer secure HttpOnly cookie
  const secureMatch = cookieHeader.match(/_uid=([^;]+)/);
  if (secureMatch) return secureMatch[1];

  // Fall back to legacy cookie
  const legacyMatch = cookieHeader.match(/userId=([^;]+)/);

  return legacyMatch ? legacyMatch[1] : null;
}

/**
 * Get user display name from cookies (server-side)
 * @param cookieHeader - Cookie header from request
 */
export function getUserDisplayNameFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(/userDisplayName=([^;]+)/);

  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * @deprecated Email is no longer stored in cookies (PII removal).
 * Returns null. Use Firebase Admin auth verification instead.
 */
export function getUserEmailFromCookie(_cookieHeader: string | null): string | null {
  return null;
}

/**
 * Get user ID from Next.js cookies API (server-side)
 * @param cookieStore - Next.js cookies() return value
 */
export function getUserIdFromCookies(
  cookieStore: { get: (name: string) => { value: string } | undefined }
): string | null {
  // Prefer HttpOnly _uid cookie
  const secureCookie = cookieStore.get('_uid');
  if (secureCookie?.value) return secureCookie.value;

  // Fall back to legacy cookie
  const legacyCookie = cookieStore.get('userId');

  return legacyCookie?.value ?? null;
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
      const storedUser = localStorage.getItem(FIREBASE_USER_KEY);
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

/**
 * Get user info from cookies (server-side).
 *
 * Determines anonymity by checking:
 * (1) the "anon_" prefix, and
 * (2) whether a display name cookie exists (Google users always have one).
 */
export function getUserFromCookies(
  cookieStore: { get: (name: string) => { value: string } | undefined }
): SignUser | null {
  const userId = getUserIdFromCookies(cookieStore);
  if (!userId) return null;

  const displayNameCookie = cookieStore.get('userDisplayName');
  const displayName = displayNameCookie?.value
    ? decodeURIComponent(displayNameCookie.value)
    : getAnonymousDisplayName(userId);

  // Determine anonymity: "anon_" prefix OR no display name (Firebase anonymous users have no name)
  const hasDisplayName = Boolean(displayNameCookie?.value);
  const isAnonymous = userId.startsWith('anon_') || !hasDisplayName;

  return {
    uid: userId,
    displayName,
    isAnonymous,
  };
}
