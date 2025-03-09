import { lazy } from 'react';
import { RouteObject } from 'react-router';
import withSuspense from './withSuspense';

const Page401 = lazy(() => import('@/view/pages/page401/Page401'));
const Page404 = lazy(() => import('@/view/pages/page404/Page404'));
const ErrorPage = lazy(() => import('@/view/pages/error/ErrorPage'));

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
