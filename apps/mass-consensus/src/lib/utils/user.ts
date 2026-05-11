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

// In-memory fallback for contexts where both localStorage and cookies are blocked
// (e.g., sandboxed iframes, privacy modes). Ensures getOrCreateAnonymousUser()
// returns a stable id within the same page load.
let inMemoryAnonymousUserId: string | null = null;

function safeLocalStorageGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // localStorage blocked (private mode, sandboxed iframe, cookies disabled)
  }
}

function readUserIdCookie(): string | null {
  try {
    if (typeof document === 'undefined' || !document.cookie) return null;
    const match = document.cookie.match(/(?:^|;\s*)userId=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Get or create anonymous user ID (client-side only)
 * This function should only be called in client components.
 *
 * Resilient to environments where localStorage is blocked (SecurityError) —
 * falls back to the `userId` cookie set by middleware, then to an in-memory id.
 */
export function getOrCreateAnonymousUser(): string {
  if (typeof window === 'undefined') {
    throw new Error('getOrCreateAnonymousUser can only be called on client-side');
  }

  const storedId = safeLocalStorageGet(USER_ID_KEY);
  if (storedId) return storedId;

  const cookieId = readUserIdCookie();
  if (cookieId) {
    safeLocalStorageSet(USER_ID_KEY, cookieId);
    return cookieId;
  }

  if (inMemoryAnonymousUserId) return inMemoryAnonymousUserId;

  const newId = generateAnonymousUserId();
  inMemoryAnonymousUserId = newId;
  safeLocalStorageSet(USER_ID_KEY, newId);

  return newId;
}

/**
 * Get user ID from cookies (server-side).
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
 * Get user ID from Next.js cookies API (server-side)
 * @param cookieStore - Next.js cookies() return value
 */
export function getUserIdFromCookies(cookieStore: { get: (name: string) => { value: string } | undefined }): string | null {
  // Prefer HttpOnly _uid cookie
  const secureCookie = cookieStore.get('_uid');
  if (secureCookie?.value) return secureCookie.value;

  // Fall back to legacy cookie
  const legacyCookie = cookieStore.get('userId');

  return legacyCookie?.value ?? null;
}

const pseudoNameAdjectives = [
  'Clear', 'Thoughtful', 'Curious', 'Insightful', 'Creative',
  'Analytical', 'Observant', 'Mindful', 'Reflective', 'Intuitive',
  'Logical', 'Wise', 'Bright', 'Deep', 'Fair',
  'Open', 'Sharp', 'Quick', 'Keen', 'Bold',
];

const pseudoNameNouns = [
  'Thought', 'Mind', 'Voice', 'Perspective', 'View',
  'Insight', 'Question', 'Explorer', 'Thinker', 'Observer',
  'Analyst', 'Contributor', 'Participant', 'Learner', 'Seeker',
  'Scholar', 'Listener', 'Speaker', 'Idea', 'Vision',
];

/**
 * Generate a deterministic display name for anonymous users.
 * Same userId always produces the same distinguished name.
 * @param userId - Anonymous user ID
 */
export function getAnonymousDisplayName(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  hash = Math.abs(hash);

  const adjIdx = hash % pseudoNameAdjectives.length;
  const nounIdx = Math.floor(hash / pseudoNameAdjectives.length) % pseudoNameNouns.length;
  const number = (hash % 999) + 1;

  return `${pseudoNameAdjectives[adjIdx]} ${pseudoNameNouns[nounIdx]} ${number}`;
}
