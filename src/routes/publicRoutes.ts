import { RouteObject } from 'react-router';
import withSuspense from './withSuspense';
import lazyWithRetry from './lazyWithRetry';

const Home = lazyWithRetry(() => import('@/view/pages/home/Home'), 'Home');
const HomeMain = lazyWithRetry(() => import('@/view/pages/home/main/HomeMain'), 'HomeMain');

const Start = lazyWithRetry(() => import('@/view/pages/start/Start'), 'Start');
const LoginPage = lazyWithRetry(() => import('@/view/pages/login/LoginFirst'), 'LoginPage');
const MemberRejection = lazyWithRetry(
	() => import('@/view/pages/memberRejection/MemberRejection'),
	'MemberRejection',
);

export const publicRoutes: RouteObject[] = [
	{
		path: 'home',
		element: withSuspense(Home),
		children: [
			{
				index: true,
				element: withSuspense(HomeMain),
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
