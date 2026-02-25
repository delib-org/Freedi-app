import { createBrowserRouter, Navigate } from 'react-router';
import App from '@/App';

// Lazy-loaded routes
import { publicRoutes } from './publicRoutes';
import { protectedRoutes, userRoutes } from './protectedRoutes';
import { errorRoutes } from './errorRoutes';

// Protected layout wrapper
import ProtectedLayout from './ProtectedLayout';

// Error page must be synchronous to catch errors during initial load
import ErrorPage from '@/view/pages/error/ErrorPage';

// Start page (needs to be available at root level for /start route)
import { Suspense } from 'react';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import lazyWithRetry from './lazyWithRetry';

const Start = lazyWithRetry(() => import('@/view/pages/start/Start'), 'Start-root');

// Combine all routes into a single router
export const router = createBrowserRouter([
	{
		// Redirect /index.html to / to prevent React Router error
		path: '/index.html',
		element: <Navigate to="/" replace />,
	},
	{
		path: '/start',
		element: (
			<Suspense fallback={<LoadingPage />}>
				<Start />
			</Suspense>
		),
	},
	{
		// App layout with User Authentication.
		path: '/',
		element: <App />,
		errorElement: <ErrorPage />,
		children: [
			// Public routes directly under App with no Authorization.
			...publicRoutes,
			// Protected routes wrapped in ProtectedLayout that contains user Authorization for Statement.
			{
				element: <ProtectedLayout />,
				children: [...protectedRoutes],
			},
			// User profile routes that need authentication but not statement authorization
			...userRoutes,
		],
	},
	// Error routes at root level.
	...errorRoutes,
]);

export default router;
