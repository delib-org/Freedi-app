import { lazy } from 'react';
import { RouteObject } from 'react-router';
import withSuspense from './withSuspense';

const StatementMain = lazy(
	() => import('@/view/pages/statement/StatementMain')
);
const Stage = lazy(() => import('@/view/pages/stage/Stage'));

export const protectedRoutes: RouteObject[] = [
	{
		path: 'statement/:statementId',
		element: withSuspense(StatementMain),
		children: [
			{
				path: ':screen',
				element: withSuspense(StatementMain),
			},
		],
	},
	{
		path: 'stage/:stageId',
		element: withSuspense(Stage),
	},
	// ... other protected routes
];
