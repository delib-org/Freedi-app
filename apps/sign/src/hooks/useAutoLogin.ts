/**
 * Auto-login hook for Sign app
 * Automatically logs users into Firebase Auth anonymously if not already logged in
 */

import { useEffect, useRef } from 'react';
import { useUser } from './useUser';
import { anonymousLogin } from '@/lib/firebase/client';

/**
 * Get cookie value by name
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

/**
 * Automatically logs user into Firebase Auth anonymously if not logged in
 * This enables real-time features like voting and collaborative editing
 *
 * IMPORTANT: Will NOT create anonymous user if:
 * - There's a userId cookie (indicating an existing session)
 * - We're still waiting for auth to initialize
 * - Anonymous login was already attempted
 */
export function useAutoLogin() {
  const user = useUser();
  const hasAttemptedLogin = useRef(false);
  const isInitializing = useRef(true);

  useEffect(() => {
    // Give auth time to initialize (1 second)
    const initTimer = setTimeout(() => {
      isInitializing.current = false;
    }, 1000);

    return () => clearTimeout(initTimer);
  }, []);

  useEffect(() => {
    // CRITICAL: Only create anonymous user if:
    // 1. User is null (no Firebase Auth user)
    // 2. No userId cookie (no existing session)
    // 3. Auth has finished initializing (not first render)
    // 4. Haven't already attempted login

    const userId = getCookie('userId');

    if (!user && !userId && !isInitializing.current && !hasAttemptedLogin.current) {
      console.info('[useAutoLogin] No user or cookie found, creating anonymous session');
      hasAttemptedLogin.current = true;
      anonymousLogin()
        .catch((error) => {
          console.error('[useAutoLogin] Failed to login anonymously:', error);
          hasAttemptedLogin.current = false; // Allow retry on error
        });
    } else if (!user && userId) {
      // User has a cookie but Firebase Auth hasn't loaded yet
      // This is normal - wait for AuthSync to restore the session
      console.info('[useAutoLogin] Cookie found, waiting for auth to restore session', {
        userId: userId.substring(0, 10) + '...'
      });
    } else if (user) {
      // User is already logged in
      console.info('[useAutoLogin] User already logged in', {
        userId: user.uid.substring(0, 10) + '...',
        isAnonymous: user.isAnonymous
      });
    }
  }, [user]);

  return user;
}
