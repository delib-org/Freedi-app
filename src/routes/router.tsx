import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';

// Layout components
const App = lazy(() => import('@/App'));
const ProtectedLayout = lazy(() => import('@/routes/ProtectedLayout'));

// Routes
import { protectedRoutes } from './protectedRoutes';
import { publicRoutes } from './publicRoutes';
import { massConsensusRoutes } from './massConsensusRoutes';
import { errorRoutes } from './errorRoutes';
import withSuspense from './withSuspense';

export const router = createBrowserRouter([
	{
		path: '/start',
		element: withSuspense(lazy(() => import('@/view/pages/start/Start'))),
	},
	{
		// App layout with User Authentication.
		path: '/',
		element: withSuspense(App),
		errorElement: withSuspense(
			lazy(() => import('@/view/pages/error/ErrorPage'))
		),
		children: [
			// Public routes directly under App with no Authorization.
			...publicRoutes,
			// Protected routes wrapped in ProtectedLayout that contains user Authorization for Statement.
			{
				element: withSuspense(ProtectedLayout),
				children: protectedRoutes,
			},
		],
	},
	// Error routes at root level.
	...errorRoutes,
	// Mass consensus routes at root level.
	...massConsensusRoutes,
]);
