import { lazy } from 'react';
import { RouteObject } from 'react-router';
import { withSuspense } from './router';

const Start = lazy(() => import('@/view/pages/start/Start'));
const LoginPage = lazy(() => import('@/view/pages/login/LoginFirst'));
const MemberRejection = lazy(
	() => import('@/view/pages/memberRejection/MemberRejection')
);

export const publicRoutes: RouteObject[] = [
	{
		index: true,
		element: withSuspense(Start),
	},
	{
		path: 'login-first',
		element: withSuspense(LoginPage),
	},
	{
		path: 'member-rejection',
		element: withSuspense(MemberRejection),
	},
];
