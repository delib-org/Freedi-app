import React from 'react';
import { RouteObject } from 'react-router';
import { StatementSkeleton } from '@/view/components/atomic/molecules/StatementSkeleton';
import withSuspense, { withCustomSuspense } from './withSuspense';
import lazyWithRetry from './lazyWithRetry';
// Hot path — loaded eagerly so opening a statement has no chunk round-trip
import StatementMain from '@/view/pages/statement/StatementMain';

// Lazy load rarely-used protected route components with retry on chunk failure
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
const EngagementDashboard = lazyWithRetry(
	() => import('@/view/pages/engagement/EngagementDashboard'),
	'EngagementDashboard',
);
const SubscriptionManager = lazyWithRetry(
	() => import('@/view/pages/subscriptions/SubscriptionManager'),
	'SubscriptionManager',
);
const GroupsCurationPage = lazyWithRetry(
	() => import('@/view/pages/statement/components/groups/GroupsCurationPage'),
	'GroupsCurationPage',
);
const ClusterMap = lazyWithRetry(
	() => import('@/view/pages/statement/components/map/ClusterMap/ClusterMap'),
	'ClusterMap',
);
const EventDashboard = lazyWithRetry(
	() => import('@/view/pages/eventControlCenter/EventDashboard'),
	'EventDashboard',
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
		element: <StatementMain />,
	},
	{
		path: 'statement/:statementId',
		element: <StatementMain />,
		children: [
			{
				path: ':sort',
				element: <StatementMain />,
			},
		],
	},
	{
		path: 'statement/:statementId/thank-you',
		element: withLoadingSuspense(VotingThankYou),
	},
	{
		path: 'statement-screen/:statementId',
		element: <StatementMain />,
		children: [
			{
				path: ':screen',
				element: <StatementMain />,
			},
		],
	},
	{
		path: 'stage/:statementId/:sort',
		element: <StatementMain />,
	},
	{
		path: 'my-suggestions/statement/:statementId',
		element: withLoadingSuspense(MySuggestions),
	},
	{
		path: 'statement/:statementId/groups',
		element: withLoadingSuspense(GroupsCurationPage),
	},
	{
		// Shareable / embeddable cluster board. Access is governed by the
		// statement's membership.access via ProtectedLayout (public statements
		// auto sign-in anonymous visitors).
		path: 'map/:statementId',
		element: withStatementSuspense(ClusterMap),
	},
	{
		path: 'map/:statementId/embed',
		element: withStatementSuspense(ClusterMap),
	},
	{
		// Event Control Center — read-only dashboard over a group's activities.
		// Guarded by ProtectedLayout (group membership) + facilitator (admin) check.
		path: 'events/:statementId',
		element: withLoadingSuspense(EventDashboard),
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
	{
		path: 'my/engagement',
		element: withLoadingSuspense(EngagementDashboard),
	},
	{
		path: 'my/subscriptions',
		element: withLoadingSuspense(SubscriptionManager),
	},
];
