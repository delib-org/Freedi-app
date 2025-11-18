/**
 * Anonymous user management utilities
 * Handles user identification without authentication
 */

const USER_ID_KEY = 'anonymousUserId';

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
 * Get user ID from cookies (server-side)
 * @param cookieHeader - Cookie header from request
 */
export function getUserIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(/userId=([^;]+)/);
  
return match ? match[1] : null;
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
