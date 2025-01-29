import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';

// Custom components
const App = lazy(() => import('./App'));
const ErrorPage = lazy(() => import('./view/pages/error/ErrorPage'));
const Home = lazy(() => import('./view/pages/home/Home'));
const AddStatement = lazy(() => import('./view/pages/home/main/addStatement/AddStatement'));
const HomeMain = lazy(() => import('./view/pages/home/main/HomeMain'));
const LoginPage = lazy(() => import('./view/pages/login/LoginFirst'));
const MemberRejection = lazy(() => import('./view/pages/memberRejection/MemberRejection'));
const Page401 = lazy(() => import('./view/pages/page401/Page401'));
const Page404 = lazy(() => import('./view/pages/page404/Page404'));
const Start = lazy(() => import('./view/pages/start/Start'));
const StatementMain = lazy(() => import('./view/pages/statement/StatementMain'));
const Stage = lazy(() => import('./view/pages/stage/Stage'));

// Fallback component for hydration
const HydrationFallback = () => <div>Loading...</div>;

export const router = createBrowserRouter([
	{
		path: '/',
		element: <App />,
		errorElement: <ErrorPage />,
		HydrateFallback: HydrationFallback,
		children: [
			{
				index: true,
				element: <Start />,
				errorElement: <ErrorPage />,
			},
			{
				path: 'home',
				element: <Home />,
				errorElement: <ErrorPage />,
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
				path: 'member-rejection',
				element: <MemberRejection />,
			},
			{
				path: 'login-first',
				element: <LoginPage />,
			},
			{
				path: 'statement/:statementId',
				element: <StatementMain />,
				children: [
					{
						path: ':screen',
						element: <StatementMain />,
					},
				],
			},
			{
				path: 'statement/:statementId/:page',
				element: <StatementMain />,
				children: [
					{
						path: ':sort',
						element: <StatementMain />,
					},
				],
			},
			{
				path: 'stage/:stageId',
				element: <Stage />,
			},
			{
				path: 'statement-an/:anonymous/:statementId/:page',
				element: <StatementMain />,
				children: [
					{
						path: ':sort',
						element: <StatementMain />,
					},
				],
			},
			{
				path: '401',
				element: <Page401 />,
			},
		],
	},
	{
		path: '404',
		element: <Page404 />,
	},
	{
		path: '*',
		element: <Page404 />,
	},
]);