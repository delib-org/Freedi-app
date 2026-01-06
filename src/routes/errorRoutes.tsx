import { lazy, Suspense } from 'react';
import { RouteObject } from 'react-router';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import Page401 from '@/view/pages/page401/Page401';
import ErrorPage from '@/view/pages/error/ErrorPage';

// Page404 is still lazy loaded as it's not imported elsewhere
const Page404 = lazy(() => import('@/view/pages/page404/Page404'));

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
		element: <Page401 />,
	},
	{
		path: '404',
		element: withSuspense(Page404),
	},
	{
		path: '*',
		element: <ErrorPage />,
	},
];
