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
 * Check if a user ID is anonymous
 */
export function isAnonymousUser(userId: string): boolean {
  return userId.startsWith('anon_');
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
 * Get user info from cookies (server-side)
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

  return {
    uid: userId,
    displayName,
    isAnonymous: isAnonymousUser(userId),
  };
}
