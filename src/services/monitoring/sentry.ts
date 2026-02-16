import * as Sentry from '@sentry/react';
import { useLocation, useNavigationType } from 'react-router';
import React, { useEffect } from 'react';

export function initSentry() {
	const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

	// Only initialize in production and if we have a valid DSN
	if (
		import.meta.env.PROD &&
		sentryDsn &&
		sentryDsn !== 'YOUR_SENTRY_DSN_HERE' &&
		sentryDsn.startsWith('https://')
	) {
		Sentry.init({
			dsn: sentryDsn,
			environment: import.meta.env.VITE_ENVIRONMENT || 'production',
			integrations: [Sentry.browserTracingIntegration()],
			// Performance Monitoring
			tracesSampleRate: 0.1, // Capture 10% of transactions for performance monitoring

			// Release tracking
			release: import.meta.env.VITE_APP_VERSION || '1.0.11',

			// Filter out non-critical errors
			beforeSend(event, hint) {
				// Filter out cancelled requests
				const error = hint.originalException;
				if (error instanceof Error && error.message?.includes('cancelled')) {
					return null;
				}

				// Filter out network errors in development
				if (
					import.meta.env.DEV &&
					error instanceof Error &&
					error.message?.includes('NetworkError')
				) {
					return null;
				}

				// Don't send events with no error
				if (!event.exception && !event.message) {
					return null;
				}

				return event;
			},

			// Ignore specific errors
			ignoreErrors: [
				// Browser extensions
				'top.GLOBALS',
				'ResizeObserver loop limit exceeded',
				'Non-Error promise rejection captured',
				// Network errors
				'Network request failed',
				'NetworkError',
				'Failed to fetch',
				// Firebase errors that are handled
				'permission-denied',
			],
		});
	}
}

// Enhanced error capture with context
export function captureException(error: Error, context?: Record<string, unknown>) {
	if (import.meta.env.DEV) {
		console.error('Error captured:', error, context);

		return;
	}

	Sentry.withScope((scope) => {
		if (context) {
			scope.setContext('additional', context);
		}

		// Add user context if available
		try {
			const userString = localStorage.getItem('user');
			if (userString) {
				const user = JSON.parse(userString);
				scope.setUser({
					id: user.uid,
					email: user.email,
					username: user.displayName,
				});
			}
		} catch {
			// Ignore parsing errors
		}

		// Add breadcrumb
		scope.addBreadcrumb({
			message: 'Error occurred',
			level: 'error',
			data: context,
			timestamp: Date.now(),
		});

		Sentry.captureException(error);
	});
}

// React Router instrumentation helper
export function withSentryRouting<T extends React.ComponentType<React.ComponentProps<T>>>(
	Component: T,
): T {
	return Sentry.withSentryRouting(Component);
}

// Custom hook for route tracking
export function useSentryRouteTracking() {
	const location = useLocation();
	const navigationType = useNavigationType();

	useEffect(() => {
		if (import.meta.env.PROD) {
			Sentry.addBreadcrumb({
				category: 'navigation',
				message: `Navigated to ${location.pathname}`,
				level: 'info',
				data: {
					from: navigationType,
					search: location.search,
				},
			});
		}
	}, [location, navigationType]);
}
