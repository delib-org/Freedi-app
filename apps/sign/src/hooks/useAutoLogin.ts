/**
 * Auto-login hook for Sign app
 *
 * This hook simply returns the current user from Firebase Auth.
 * The actual anonymous login logic is handled by AuthSync in the root layout.
 *
 * AuthSync handles:
 * - New visitors: Creates anonymous user IMMEDIATELY
 * - Returning admins: Waits for auth to restore before creating anonymous
 * - Logged out users: Creates new anonymous session
 *
 * This hook is just a convenience wrapper around useUser() for components
 * that need to ensure a user exists (like suggestion features).
 */

import { useUser } from './useUser';

/**
 * Returns the current Firebase Auth user
 *
 * AuthSync (in root layout) ensures users are logged in:
 * - New visitors get anonymous login immediately
 * - Returning users wait for session restore
 * - No race conditions with admin sessions
 *
 * @returns Current user or null if auth is still initializing
 */
export function useAutoLogin() {
  const user = useUser();

  // Just return the user - AuthSync handles all login logic
  return user;
}
