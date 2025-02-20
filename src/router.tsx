import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';

// Page imports
import LoadingPage from './view/pages/loadingPage/LoadingPage';
import InitialQuestion from './view/pages/massConsensus/initialQuestion/InitialQuestion';
import RandomSuggestions from './view/pages/massConsensus/randomSuggestions/RandomSuggestions';
import SimilarSuggestions from './view/pages/massConsensus/similarSuggestions/SimilarSuggestions';
import VotingSuggestions from './view/pages/massConsensus/votingSuggestions/VotingSuggestions';
import TopSuggestions from './view/pages/massConsensus/topSuggestions/TopSuggestions';

// Types
import { MassConsensusPageUrls } from './types/TypeEnums';

// Custom components
const App = lazy(() => import('./App'));
const ErrorPage = lazy(() => import('./view/pages/error/ErrorPage'));
const Home = lazy(() => import('./view/pages/home/Home'));
const AddStatement = lazy(
	() => import('./view/pages/home/main/addStatement/AddStatement')
);
const HomeMain = lazy(() => import('./view/pages/home/main/HomeMain'));
const LoginPage = lazy(() => import('./view/pages/login/LoginFirst'));
const MemberRejection = lazy(
	() => import('./view/pages/memberRejection/MemberRejection')
);
const Page401 = lazy(() => import('./view/pages/page401/Page401'));
const Page404 = lazy(() => import('./view/pages/page404/Page404'));
const Start = lazy(() => import('./view/pages/start/Start'));
const StatementMain = lazy(
	() => import('./view/pages/statement/StatementMain')
);
const Stage = lazy(() => import('./view/pages/stage/Stage'));
const Introduction = lazy(
	() => import('./view/pages/massConsensus/introduction/Introduction')
);

// Wrapper component for Suspense
const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => (
	<Suspense fallback={<LoadingPage />}>{children}</Suspense>
);

export const router = createBrowserRouter([
	{
		path: '/',
		element: <SuspenseWrapper><App /></SuspenseWrapper>,
		errorElement: <SuspenseWrapper><ErrorPage /></SuspenseWrapper>,
		children: [
			{
				index: true,
				element: <SuspenseWrapper><Start /></SuspenseWrapper>,
			},
			{
				path: 'home',
				element: <SuspenseWrapper><Home /></SuspenseWrapper>,
				children: [
					{
						index: true,
						element: <SuspenseWrapper><HomeMain /></SuspenseWrapper>,
					},
					{
						path: 'addStatement',
						element: <SuspenseWrapper><AddStatement /></SuspenseWrapper>,
					},
				],
			},
			{
				path: 'member-rejection',
				element: <SuspenseWrapper><MemberRejection /></SuspenseWrapper>,
			},
			{
				path: 'login-first',
				element: <SuspenseWrapper><LoginPage /></SuspenseWrapper>,
			},
			{
				path: 'statement/:statementId',
				element: <SuspenseWrapper><StatementMain /></SuspenseWrapper>,
				children: [
					{
						path: ':screen',
						element: <SuspenseWrapper><StatementMain /></SuspenseWrapper>,
					},
				],
			},
			{
				path: 'statement/:statementId/:page',
				element: <SuspenseWrapper><StatementMain /></SuspenseWrapper>,
				children: [
					{
						path: ':sort',
						element: <SuspenseWrapper><StatementMain /></SuspenseWrapper>,
					},
				],
			},
			{
				path: 'stage/:stageId',
				element: <SuspenseWrapper><Stage /></SuspenseWrapper>,
			},
			{
				path: 'statement-an/:anonymous/:statementId/:page',
				element: <SuspenseWrapper><StatementMain /></SuspenseWrapper>,
				children: [
					{
						path: ':sort',
						element: <SuspenseWrapper><StatementMain /></SuspenseWrapper>,
					},
				],
			},
			{
				path: '401',
				element: <SuspenseWrapper><Page401 /></SuspenseWrapper>,
			},
		],
	},
	{
		path: 'mass-consensus/:statementId',
		children: [
			{
				index: true, // This will be the default route
				element: <SuspenseWrapper><Introduction /></SuspenseWrapper>,
			},
			{
				path: MassConsensusPageUrls.introduction,
				element: <SuspenseWrapper><Introduction /></SuspenseWrapper>,
			},
			{
				path: MassConsensusPageUrls.initialQuestion,
				element: <SuspenseWrapper><InitialQuestion /></SuspenseWrapper>,
			},
			{
				path: MassConsensusPageUrls.similarSuggestions,
				element: <SuspenseWrapper><SimilarSuggestions /></SuspenseWrapper>,
			},
			{
				path: MassConsensusPageUrls.randomSuggestions,
				element: <SuspenseWrapper><RandomSuggestions /></SuspenseWrapper>,
			},
			{
				path: MassConsensusPageUrls.topSuggestions,
				element: <SuspenseWrapper><TopSuggestions /></SuspenseWrapper>,
			},
			{
				path: MassConsensusPageUrls.voting,
				element: <SuspenseWrapper><VotingSuggestions /></SuspenseWrapper>,
			}
		]
	},
	{
		path: '404',
		element: <SuspenseWrapper><Page404 /></SuspenseWrapper>,
	},
	{
		path: '*',
		element: <SuspenseWrapper><Page404 /></SuspenseWrapper>,
	},
]);
