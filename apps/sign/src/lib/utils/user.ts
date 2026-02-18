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

  // Set cookie for server-side access
  document.cookie = `userId=${userId}; path=/; max-age=31536000; SameSite=Lax`;

  return userId;
}

/**
 * Store Firebase user info (client-side)
 */
export function setFirebaseUser(user: { uid: string; displayName: string | null; email: string | null }): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(FIREBASE_USER_KEY, JSON.stringify(user));
  localStorage.setItem(USER_ID_KEY, user.uid);

  // Set cookie for server-side access
  document.cookie = `userId=${user.uid}; path=/; max-age=31536000; SameSite=Lax`;
  document.cookie = `userDisplayName=${encodeURIComponent(user.displayName || '')}; path=/; max-age=31536000; SameSite=Lax`;
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
export function getUserIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(/userId=([^;]+)/);

  return match ? match[1] : null;
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
 * Get user email from cookies (server-side)
 * @param cookieHeader - Cookie header from request
 */
export function getUserEmailFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(/userEmail=([^;]+)/);

  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Get user ID from Next.js cookies API (server-side)
 * @param cookieStore - Next.js cookies() return value
 */
export function getUserIdFromCookies(
  cookieStore: { get: (name: string) => { value: string } | undefined }
): string | null {
  const userIdCookie = cookieStore.get('userId');

  return userIdCookie?.value ?? null;
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
 * On the server we cannot access localStorage, so we determine anonymity
 * by checking: (1) the "anon_" prefix, and (2) whether an email cookie exists.
 * Google-authenticated users always have an email cookie; Firebase anonymous
 * users do not.
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

  // Determine anonymity: "anon_" prefix OR no email cookie (Firebase anonymous users)
  const emailCookie = cookieStore.get('userEmail');
  const hasEmail = Boolean(emailCookie?.value);
  const isAnonymous = userId.startsWith('anon_') || !hasEmail;

  return {
    uid: userId,
    displayName,
    isAnonymous,
  };
}
