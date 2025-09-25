import { useEffect, useState } from 'react';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { handlePublicAutoAuth, isAnonymousUser } from '@/controllers/auth/publicAuthHandler';

interface UseAnonymousAuthReturn {
  isAnonymous: boolean;
  isAuthenticating: boolean;
  ensureAuthentication: () => Promise<void>;
}

/**
 * Hook for managing anonymous authentication in Mass Consensus results
 * Allows users to view results without logging in and auto-registers them if needed
 */
export const useAnonymousAuth = (): UseAnonymousAuthReturn => {
  const { isAuthenticated, isLoading: authLoading } = useAuthentication();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Check if current user is anonymous
  useEffect(() => {
    setIsAnonymous(isAnonymousUser());
  }, [isAuthenticated]);

  /**
   * Ensures user is authenticated, creating anonymous account if needed
   */
  const ensureAuthentication = async () => {
    if (isAuthenticated) {
      return; // Already authenticated
    }

    if (isAuthenticating || authLoading) {
      return; // Already in process
    }

    try {
      setIsAuthenticating(true);
      await handlePublicAutoAuth();
    } catch (error) {
      console.error('Failed to authenticate anonymously:', error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  return {
    isAnonymous,
    isAuthenticating,
    ensureAuthentication,
  };
};