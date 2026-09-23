import { RouteObject } from 'react-router';
import Page401 from '@/view/pages/page401/Page401';
import Page404 from '@/view/pages/page404/Page404';
import ErrorPage from '@/view/pages/error/ErrorPage';

// Page404 is imported statically: StatementMain renders it for a missing
// statement, so it already lives in the main bundle and lazy() gains nothing.

// Define error routes
export const errorRoutes: RouteObject[] = [
	{
		path: '401',
		element: <Page401 />,
	},
	{
		path: '404',
		element: <Page404 />,
	},
	{
		path: '*',
		element: <ErrorPage />,
	},
];
