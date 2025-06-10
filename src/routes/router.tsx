import { createBrowserRouter } from 'react-router';
import App from '@/App';
import Start from '@/view/pages/start/Start';
import ErrorPage from '@/view/pages/error/ErrorPage';
import ProtectedLayout from './ProtectedLayout';

// Error pages

// Mass Consensus pages
import MassConsensus from '@/view/pages/massConsensus/MassConsensus';
import Introduction from '@/view/pages/massConsensus/introduction/Introduction';
import MassConsensusQuestion from '@/view/pages/massConsensus/massConsesusQuestion/MassConsesusQuestion';
import RandomSuggestions from '@/view/pages/massConsensus/randomSuggestions/RandomSuggestions';
import TopSuggestions from '@/view/pages/massConsensus/topSuggestions/TopSuggestions';
import VotingSuggestions from '@/view/pages/massConsensus/votingSuggestions/VotingSuggestions';
import UserDemographicMC from '@/view/pages/massConsensus/massConsesusQuestion/userDemographicMC/UserDemographicMC';

import LeaveFeedback from '@/view/pages/massConsensus/leaveFeedback/LeaveFeedback';

// Protected routes
import StatementMain from '@/view/pages/statement/StatementMain';

// Public routes
import Home from '@/view/pages/home/Home';
import HomeMain from '@/view/pages/home/main/HomeMain';
import AddStatement from '@/view/pages/home/main/addStatement/AddStatement';
import LoginPage from '@/view/pages/login/LoginFirst';
import MemberRejection from '@/view/pages/memberRejection/MemberRejection';

// Mass Consensus URLs

import Page401 from '@/view/pages/page401/Page401';
import Page404 from '@/view/pages/page404/Page404';
import ThankYou from '@/view/pages/massConsensus/thankYou/ThankYou';
import { MassConsensusPageUrls } from 'delib-npm';

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
		element: <MassConsensus />,
		children: [
			{
				index: true,
				element: <Introduction />,
			},
			{
				path: MassConsensusPageUrls.introduction,
				element: <Introduction />,
			},
			{
				path: MassConsensusPageUrls.userDemographics,
				element: <UserDemographicMC />,
			},
			{
				path: MassConsensusPageUrls.question,
				element: <MassConsensusQuestion />,
			},
			{
				path: MassConsensusPageUrls.randomSuggestions,
				element: <RandomSuggestions />,
			},
			{
				path: MassConsensusPageUrls.topSuggestions,
				element: <TopSuggestions />,
			},
			{
				path: MassConsensusPageUrls.voting,
				element: <VotingSuggestions />,
			},
			{
				path: MassConsensusPageUrls.leaveFeedback,
				element: <LeaveFeedback />,
			},
			{
				path: MassConsensusPageUrls.thankYou,
				element: <ThankYou />,
			},
		],
	},
];

// Define protectedRoutes
const protectedRoutes = [
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
				children: protectedRoutes,
			},
		],
	},
	// Error routes at root level.
	...errorRoutes,
	// Mass consensus routes at root level.
	...massConsensusRoutes,
]);

export default router;
