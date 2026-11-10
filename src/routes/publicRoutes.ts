import { RouteObject } from 'react-router';
import React from 'react';

// Hot paths — loaded eagerly so first navigation has no chunk round-trip
import Home from '@/view/pages/home/Home';
import HomeMain from '@/view/pages/home/main/HomeMain';
import Start from '@/view/pages/start/Start';

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
];
