import { lazy, Suspense } from 'react';
import { RouteObject } from 'react-router';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';

// Error pages - lazy loaded (they're rarely accessed)
const Page401 = lazy(() => import('@/view/pages/page401/Page401'));
const Page404 = lazy(() => import('@/view/pages/page404/Page404'));
const ErrorPage = lazy(() => import('@/view/pages/error/ErrorPage'));

// Helper to wrap with suspense
const withSuspense = (Component: React.LazyExoticComponent<React.ComponentType>) => (
	<Suspense fallback={<LoadingPage />}>
		<Component />
	</Suspense>
);

// Define error routes
export const errorRoutes: RouteObject[] = [
	{
		path: '401',
		element: withSuspense(Page401),
	},
	{
		path: '404',
		element: withSuspense(Page404),
	},
	{
		path: '*',
		element: withSuspense(ErrorPage),
	},
];
