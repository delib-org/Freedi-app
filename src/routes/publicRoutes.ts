import { RouteObject } from 'react-router';
import React from 'react';
import withSuspense from './withSuspense';
import lazyWithRetry from './lazyWithRetry';

// Hot paths — loaded eagerly so first navigation has no chunk round-trip
import Home from '@/view/pages/home/Home';
import HomeMain from '@/view/pages/home/main/HomeMain';
import Start from '@/view/pages/start/Start';
import LoginPage from '@/view/pages/login/LoginFirst';

const MemberRejection = lazyWithRetry(
	() => import('@/view/pages/memberRejection/MemberRejection'),
	'MemberRejection',
);

export const publicRoutes: RouteObject[] = [
	{
		path: 'home',
		element: React.createElement(Home),
		children: [
			{
				index: true,
				element: React.createElement(HomeMain),
			},
		],
	},
	{
		index: true,
		element: React.createElement(Start),
	},
	{
		path: 'login-first',
		element: React.createElement(LoginPage),
	},
	{
		path: 'member-rejection',
		element: withSuspense(MemberRejection),
	},
];
