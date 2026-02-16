import { lazy } from 'react';
import { RouteObject } from 'react-router';
import withSuspense from './withSuspense';

const Home = lazy(() => import('@/view/pages/home/Home'));
const HomeMain = lazy(() => import('@/view/pages/home/main/HomeMain'));
const AddStatement = lazy(() => import('@/view/pages/home/main/addStatement/AddStatement'));

const Start = lazy(() => import('@/view/pages/start/Start'));
const LoginPage = lazy(() => import('@/view/pages/login/LoginFirst'));
const MemberRejection = lazy(() => import('@/view/pages/memberRejection/MemberRejection'));

export const publicRoutes: RouteObject[] = [
	{
		path: 'home',
		element: withSuspense(Home),
		children: [
			{
				index: true,
				element: withSuspense(HomeMain),
			},
			{
				path: 'addStatement',
				element: withSuspense(AddStatement),
			},
		],
	},
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
