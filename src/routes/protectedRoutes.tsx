import React from 'react';
import { RouteObject } from 'react-router';
import { StatementSkeleton } from '@/view/components/atomic/molecules/StatementSkeleton';
import withSuspense, { withCustomSuspense } from './withSuspense';
import lazyWithRetry from './lazyWithRetry';

// Lazy load protected route components with retry on chunk failure
const StatementMain = lazyWithRetry(
	() => import('@/view/pages/statement/StatementMain'),
	'StatementMain',
);
const MySuggestions = lazyWithRetry(
	() => import('@/view/pages/my-suggestions/MySuggestions'),
	'MySuggestions',
);
const VotingThankYou = lazyWithRetry(
	() => import('@/view/pages/votingThankYou/VotingThankYou'),
	'VotingThankYou',
);
const My = lazyWithRetry(() => import('@/view/pages/my/My'), 'My');
const CheckNotifications = lazyWithRetry(
	() => import('@/view/pages/settings/ChecNotifications'),
	'CheckNotifications',
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
