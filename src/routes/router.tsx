import { createBrowserRouter } from 'react-router';
import App from '@/App';
import Start from '@/view/pages/start/Start';
import ErrorPage from '@/view/pages/error/ErrorPage';
import ProtectedLayout from './ProtectedLayout';

// Error pages
import Page401 from '@/view/pages/page401/Page401';
import Page404 from '@/view/pages/page404/Page404';

// Protected routes
import StatementMain from '@/view/pages/statement/StatementMain';

// Public routes
import Home from '@/view/pages/home/Home';
import HomeMain from '@/view/pages/home/main/HomeMain';
import AddStatement from '@/view/pages/home/main/addStatement/AddStatement';
import LoginPage from '@/view/pages/login/LoginFirst';
import MemberRejection from '@/view/pages/memberRejection/MemberRejection';

// User pages
import My from '@/view/pages/my/My';
import CheckNotifications from '@/view/pages/settings/ChecNotifications';
import MySuggestions from '@/view/pages/my-suggestions/MySuggestions';
import VotingThankYou from '@/view/pages/votingThankYou/VotingThankYou';

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
		path: 'statement/:statementId/thank-you',
		element: <VotingThankYou />,
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
		element: <MySuggestions />,
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
				element: <My />,
			},
			{
				path: 'my/check-notifications',
				element: <CheckNotifications />,
			},
		],
	},
	// Error routes at root level.
	...errorRoutes,
]);

export default router;
