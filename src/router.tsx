import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import Stage from './view/pages/stage/Stage';

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

const routes = [
	{
		path: '/',
		element: <App />,
		errorElement: <ErrorPage />,
		children: [
			{
				path: '',
				element: <Start />,
				errorElement: <ErrorPage />,
			},
			{
				path: 'home',
				element: <Home />,
				errorElement: <ErrorPage />,
				children: [
					{
						path: '',
						element: <HomeMain />,
						errorElement: <ErrorPage />,
					},
					{
						path: 'addStatement',
						element: <AddStatement />,
						errorElement: <ErrorPage />,
					},
				],
			},
			{
				path: 'member-rejection',
				element: <MemberRejection />,
				errorElement: <ErrorPage />,
			},
			{
				path: 'login-first',
				element: <LoginPage />,
				errorElement: <ErrorPage />,
			},
			{
				path: 'statement/:statementId',
				element: <StatementMain />,
				errorElement: <ErrorPage />,
				children: [
					{
						path: ':screen',
						element: <StatementMain />,
						errorElement: <ErrorPage />,
					},
				],
			},
			{
				path: 'statement/:statementId/:page',
				element: <StatementMain />,
				errorElement: <ErrorPage />,
				children: [
					{
						path: ':sort',
						element: <StatementMain />,
						errorElement: <ErrorPage />,
					},
				],
			},
			{
				path: "stage/:stageId",
				element: <Stage />,
				errorElement: <ErrorPage />,
			},
			{
				path: 'statement-an/:anonymous/:statementId/:page',
				element: <StatementMain />,
				errorElement: <ErrorPage />,
				children: [
					{
						path: ':sort',
						element: <StatementMain />,
						errorElement: <ErrorPage />,
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
		errorElement: <ErrorPage />,
	},
];

export const router = createBrowserRouter(routes, {
	future: {
		v7_partialHydration: true,
		v7_normalizeFormMethod: true,
		v7_fetcherPersist: true,
		v7_skipActionErrorRevalidation: true,
		v7_relativeSplatPath: true,
	},
});
