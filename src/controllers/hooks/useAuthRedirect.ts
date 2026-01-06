import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';
import { AuthState } from './useAuthentication';

/**
 * Routes that require exact match for unauthenticated access.
 */
const EXACT_PUBLIC_ROUTES = ['/', '/start'] as const;

/**
 * Route prefixes that allow unauthenticated access.
 * These routes handle public content (statement routes may have public access).
 */
const PUBLIC_ROUTE_PREFIXES = [
	'/statement/',
	'/stage/',
	'/statement-screen/',
] as const;

/**
 * Check if a route allows unauthenticated access.
 */
const isPublicRoute = (pathname: string): boolean => {
	// Check exact matches first
	if (EXACT_PUBLIC_ROUTES.includes(pathname as typeof EXACT_PUBLIC_ROUTES[number])) {
		return true;
	}

	// Check prefix matches for routes that can have public access
	return PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
};

interface AuthRedirectResult {
	/** Whether the auth redirect check is still pending */
	isRedirecting: boolean;
}

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
 * @returns Object with isRedirecting flag to prevent rendering during redirect
 */
export const useAuthRedirect = (authState: AuthState): AuthRedirectResult => {
	const navigate = useNavigate();
	const location = useLocation();
	const [isRedirecting, setIsRedirecting] = useState(false);

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

			setIsRedirecting(true);
			navigate('/start', { replace: true });
		}
	}, [authState.isAuthenticated, authState.isLoading, location.pathname, navigate]);

	return { isRedirecting };
};
