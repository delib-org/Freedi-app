import { lazy } from 'react';
import { RouteObject } from 'react-router';
import withSuspense from './withSuspense';

const StatementMain = lazy(
	() => import('@/view/pages/statement/StatementMain')
);
const Stage = lazy(
	() =>
		import(
			'@/view/pages/statement/components/statementTypes/stage/StagePage'
		)
);

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
		path: 'statement/:statementId/:page',
		element: withSuspense(StatementMain),
		children: [
			{
				path: ':sort',
				element: withSuspense(StatementMain),
			},
		],
	},
	{
		path: 'stage/:statementId',
		element: withSuspense(Stage),
	},
	// ... other protected routes
];
