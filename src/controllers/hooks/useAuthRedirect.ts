import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';
import { AuthState } from './useAuthentication';

/**
 * Routes that allow unauthenticated access.
 * These routes handle public content (statement routes may have public access).
 */
const PUBLIC_ROUTE_PATTERNS = [
	'/start',
	'/',
	'/statement/',
	'/stage/',
	'/statement-screen/',
] as const;

/**
 * Check if a route allows unauthenticated access.
 */
const isPublicRoute = (pathname: string): boolean => {
	return PUBLIC_ROUTE_PATTERNS.some(
		(pattern) => pathname === pattern || pathname.includes(pattern)
	);
};

/**
 * Hook for handling authentication-based navigation.
 *
 * This hook is responsible ONLY for:
 * - Redirecting unauthenticated users to /start
 * - Saving the intended destination for post-login redirect
 *
 * This separation from useAuthentication follows Single Responsibility Principle (SRP).
 * Components can use useAuthentication for state and optionally useAuthRedirect for navigation.
 *
 * @param authState - The authentication state from useAuthentication
 */
export const useAuthRedirect = (authState: AuthState): void => {
	const navigate = useNavigate();
	const location = useLocation();

	useEffect(() => {
		// Only redirect after auth check is complete
		if (authState.isLoading) {
			return;
		}

		// If not authenticated and not on a public route, redirect to /start
		if (!authState.isAuthenticated && !isPublicRoute(location.pathname)) {
			// Save current location for post-login redirect
			const historyData = {
				pathname: location.pathname,
			};
			localStorage.setItem(
				LocalStorageObjects.InitialRoute,
				JSON.stringify(historyData)
			);

			navigate('/start', { replace: true });
		}
	}, [authState.isAuthenticated, authState.isLoading, location.pathname, navigate]);
};
