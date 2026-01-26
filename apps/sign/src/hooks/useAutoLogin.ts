/**
 * Auto-login hook for Sign app
 * Automatically logs users into Firebase Auth anonymously if not already logged in
 */

import { useEffect } from 'react';
import { useUser } from './useUser';
import { anonymousLogin } from '@/lib/firebase/client';

/**
 * Automatically logs user into Firebase Auth anonymously if not logged in
 * This enables real-time features like voting and collaborative editing
 */
export function useAutoLogin() {
  const user = useUser();

  useEffect(() => {
    // If no Firebase Auth user, auto-login anonymously
    if (!user) {
      anonymousLogin()
        .catch((error) => {
          console.error('[useAutoLogin] Failed to login anonymously:', error);
        });
    }
  }, [user]);

  return user;
}
