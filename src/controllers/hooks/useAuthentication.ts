import { AuthState, useAuthState } from '@/context/AuthStateContext';

export type { AuthState };

/**
 * Hook for accessing authentication state.
 *
 * Delegates to AuthStateProvider which manages the single
 * onAuthStateChanged listener for the entire app.
 *
 * This hook is responsible ONLY for:
 * - Tracking authentication state (isAuthenticated, isLoading, user, creator)
 *
 * The actual listener, Redux sync, DB persistence, and logout reset
 * are handled centrally by AuthStateProvider.
 *
 * Navigation/routing is handled separately by AuthRedirectHandler component.
 */
export const useAuthentication = (): AuthState => {
	return useAuthState();
};
