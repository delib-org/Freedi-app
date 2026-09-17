import React from 'react';
import { RouteObject } from 'react-router';
import Page401 from '@/view/pages/page401/Page401';
import Page404 from '@/view/pages/page404/Page404';
import ErrorPage from '@/view/pages/error/ErrorPage';

// Page404 is imported directly: StatementMain renders it for a missing
// statement, so it is already in the main chunk and lazy loading it here only
// added a Suspense boundary Rollup had to warn about.

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
