import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import App from '@/App';
import Start from '@/view/pages/start/Start';
import ErrorPage from '@/view/pages/error/ErrorPage';
import ProtectedLayout from './ProtectedLayout';
import RouteLoader from '@/view/components/loading/RouteLoader';

// Wrap lazy components with Suspense
const withSuspense = (Component: React.ComponentType) => {
	return (
		<Suspense fallback={<RouteLoader />}>
			<Component />
		</Suspense>
	);
};

// Error pages

// Mass Consensus pages - Lazy load these as they're used in specific flows
const MassConsensus = lazy(() => import('@/view/pages/massConsensus/MassConsensus'));
const Introduction = lazy(() => import('@/view/pages/massConsensus/introduction/Introduction'));
const MassConsensusQuestion = lazy(() => import('@/view/pages/massConsensus/massConsesusQuestion/MassConsesusQuestion'));
const RandomSuggestions = lazy(() => import('@/view/pages/massConsensus/randomSuggestions/RandomSuggestions'));
const TopSuggestions = lazy(() => import('@/view/pages/massConsensus/topSuggestions/TopSuggestions'));
const VotingSuggestions = lazy(() => import('@/view/pages/massConsensus/votingSuggestions/VotingSuggestions'));
const ResultsSummary = lazy(() => import('@/view/pages/massConsensus/resultsSummary/ResultsSummary'));
const LeaveFeedback = lazy(() => import('@/view/pages/massConsensus/leaveFeedback/LeaveFeedback'));
const MassConsensusMySuggestions = lazy(() => import('@/view/pages/massConsensus/mySuggestions/MassConsensusMySuggestions'));

// Protected routes - Heavy component, definitely lazy load
const StatementMain = lazy(() => import('@/view/pages/statement/StatementMain'));

// Public routes
import Home from '@/view/pages/home/Home';
import HomeMain from '@/view/pages/home/main/HomeMain';
import AddStatement from '@/view/pages/home/main/addStatement/AddStatement';
import LoginPage from '@/view/pages/login/LoginFirst';
import MemberRejection from '@/view/pages/memberRejection/MemberRejection';

// Mass Consensus URLs

import Page401 from '@/view/pages/page401/Page401';
import Page404 from '@/view/pages/page404/Page404';
import { MassConsensusPageUrls } from 'delib-npm';
const ThankYou = lazy(() => import('@/view/pages/massConsensus/thankYou/ThankYou'));
const UserDemographicMC = lazy(() => import('@/view/pages/massConsensus/massConsesusQuestion/userDemographicMC/UserDemographicMC'));
const My = lazy(() => import('@/view/pages/my/My'));
const CheckNotifications = lazy(() => import('@/view/pages/settings/ChecNotifications'));
const MySuggestions = lazy(() => import('@/view/pages/my-suggestions/MySuggestions'));

// Define errorRoutes
const errorRoutes = [
	{
		path: '401',
		element: <Page401 />,
	},
	{
		path: '404',
		element: <Page404 />,
	},
	{
		path: '*',
		element: <ErrorPage />,
	},
];

// Define massConsensusRoutes
const massConsensusRoutes = [
	{
		path: 'mass-consensus/:statementId',
		element: withSuspense(MassConsensus),
		children: [
			{
				index: true,
				element: withSuspense(Introduction),
			},
			{
				path: MassConsensusPageUrls.introduction,
				element: withSuspense(Introduction),
			},
			{
				path: MassConsensusPageUrls.userDemographics,
				element: withSuspense(UserDemographicMC),
			},
			{
				path: MassConsensusPageUrls.question,
				element: withSuspense(MassConsensusQuestion),
			},
			{
				path: MassConsensusPageUrls.randomSuggestions,
				element: withSuspense(RandomSuggestions),
			},
			{
				path: MassConsensusPageUrls.topSuggestions,
				element: withSuspense(TopSuggestions),
			},
			{
				path: MassConsensusPageUrls.voting,
				element: withSuspense(VotingSuggestions),
			},
			{
				path: MassConsensusPageUrls.results,
				element: withSuspense(ResultsSummary),
			},
			{
				path: MassConsensusPageUrls.leaveFeedback,
				element: withSuspense(LeaveFeedback),
			},
			{
				path: MassConsensusPageUrls.thankYou,
				element: withSuspense(ThankYou),
			},
			{
				path: 'my-suggestions',
				element: withSuspense(MassConsensusMySuggestions),
			},
		],
	},
];

// Define protectedRoutes
const protectedRoutes = [
	{
		path: 'stage/:statementId',
		element: withSuspense(StatementMain),
	},
	{
		path: 'statement/:statementId',
		element: withSuspense(StatementMain),
		children: [
			{
				path: ':sort',
				element: withSuspense(StatementMain),
			},
		],
	},
	{
		path: 'statement-screen/:statementId',
		element: withSuspense(StatementMain),
		children: [
			{
				path: ':screen',
				element: withSuspense(StatementMain),
			},
		],
	},
	{
		path: 'stage/:statementId/:sort',
		element: withSuspense(StatementMain),
	},
	{
		path: 'my-suggestions/statement/:statementId',
		element: withSuspense(MySuggestions),
	},
	// ... other protected routes
];

// Define publicRoutes
const publicRoutes = [
	{
		path: 'home',
		element: <Home />,
		children: [
			{
				index: true,
				element: <HomeMain />,
			},
			{
				path: 'addStatement',
				element: <AddStatement />,
			},
		],
	},
	{
		index: true,
		element: <Start />,
	},
	{
		path: 'login-first',
		element: <LoginPage />,
	},
	{
		path: 'member-rejection',
		element: <MemberRejection />,
	},
];

// Combine all routes into a single router
export const router = createBrowserRouter([
	{
		path: '/start',
		element: <Start />,
	},
	{
		// App layout with User Authentication.
		path: '/',
		element: <App />,
		errorElement: <ErrorPage />,
		children: [
			// Public routes directly under App with no Authorization.
			...publicRoutes,
			// Protected routes wrapped in ProtectedLayout that contains user Authorization for Statement.
			{
				element: <ProtectedLayout />,
				children: [
					...protectedRoutes,
				],
			},
			// User profile routes that need authentication but not statement authorization
			{
				path: 'my',
				element: withSuspense(My),
			},
			{
				path: 'my/check-notifications',
				element: withSuspense(CheckNotifications),
			},
		],
	},
	// Error routes at root level.
	...errorRoutes,
	// Mass consensus routes at root level.
	...massConsensusRoutes,
]);

export default router;
