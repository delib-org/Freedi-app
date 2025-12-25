import { lazy } from 'react';
import { RouteObject } from 'react-router';
import { StatementSkeleton } from '@/view/components/atomic/molecules/StatementSkeleton';
import withSuspense, { withCustomSuspense } from './withSuspense';

// Lazy load protected route components
const StatementMain = lazy(
	() => import('@/view/pages/statement/StatementMain')
);
const MySuggestions = lazy(
	() => import('@/view/pages/my-suggestions/MySuggestions')
);
const VotingThankYou = lazy(
	() => import('@/view/pages/votingThankYou/VotingThankYou')
);
const My = lazy(() => import('@/view/pages/my/My'));
const CheckNotifications = lazy(
	() => import('@/view/pages/settings/ChecNotifications')
);

// Helper to wrap with skeleton suspense (first load only)
const withStatementSuspense = (Component: React.LazyExoticComponent<React.ComponentType>) =>
	withCustomSuspense(Component, <StatementSkeleton />);

// Helper to wrap with loading page suspense (first load only)
const withLoadingSuspense = (Component: React.LazyExoticComponent<React.ComponentType>) =>
	withSuspense(Component);

// Define protectedRoutes with lazy loading and skeleton
export const protectedRoutes: RouteObject[] = [
	{
		path: 'stage/:statementId',
		element: withStatementSuspense(StatementMain),
	},
	{
		path: 'statement/:statementId',
		element: withStatementSuspense(StatementMain),
		children: [
			{
				path: ':sort',
				element: withStatementSuspense(StatementMain),
			},
		],
	},
	{
		path: 'statement/:statementId/thank-you',
		element: withLoadingSuspense(VotingThankYou),
	},
	{
		path: 'statement-screen/:statementId',
		element: withStatementSuspense(StatementMain),
		children: [
			{
				path: ':screen',
				element: withStatementSuspense(StatementMain),
			},
		],
	},
	{
		path: 'stage/:statementId/:sort',
		element: withStatementSuspense(StatementMain),
	},
	{
		path: 'my-suggestions/statement/:statementId',
		element: withLoadingSuspense(MySuggestions),
	},
];

// User profile routes (need auth but not statement authorization)
export const userRoutes: RouteObject[] = [
	{
		path: 'my',
		element: withLoadingSuspense(My),
	},
	{
		path: 'my/check-notifications',
		element: withLoadingSuspense(CheckNotifications),
	},
];
