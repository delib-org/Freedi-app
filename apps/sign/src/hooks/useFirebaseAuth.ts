'use client';

import { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';

interface UseFirebaseAuthReturn {
  user: User | null;
  isAuthReady: boolean;
  isAuthenticated: boolean;
}

/**
 * Hook to track Firebase Auth state.
 * Handles the async initialization of Firebase Auth and provides
 * a stable auth state for components that need to wait for auth to be ready.
 */
export function useFirebaseAuth(): UseFirebaseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') {
      return;
    }

    const auth = getFirebaseAuth();

    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthReady(true);

      if (firebaseUser) {
        console.info('[useFirebaseAuth] User authenticated:', {
          uid: firebaseUser.uid,
          isAnonymous: firebaseUser.isAnonymous,
        });
      } else {
        console.info('[useFirebaseAuth] No user authenticated');
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    user,
    isAuthReady,
    isAuthenticated: isAuthReady && user !== null,
  };
}
