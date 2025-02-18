import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import LoadingPage from './view/pages/loadingPage/LoadingPage'; // Adjust the import path as needed
import InitialQuestion from './view/pages/massConsensus/initialQuestion/InitialQuestion';
import { MassConsensusPageUrls } from './types/TypeEnums';
import RandomSuggestions from './view/pages/massConsensus/randomSuggestions/RandomSuggestions';
import SimilarSuggestions from './view/pages/massConsensus/similarSuggestions/SimilarSuggestions';
import VotingSuggestions from './view/pages/massConsensus/votingSuggestions/VotingSuggestions';
import TopSuggestions from './view/pages/massConsensus/topSuggestions/TopSuggestions';

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

export const router = createBrowserRouter([
	{
		path: '/',
		element: (
			<Suspense fallback={<LoadingPage />}>
				<App />
			</Suspense>
		),
		errorElement: (
			<Suspense fallback={<LoadingPage />}>
				<ErrorPage />
			</Suspense>
		),
		children: [
			{
				index: true,
				element: (
					<Suspense fallback={<LoadingPage />}>
						<Start />
					</Suspense>
				),
				errorElement: (
					<Suspense fallback={<LoadingPage />}>
						<ErrorPage />
					</Suspense>
				),
			},
			{
				path: 'home',
				element: (
					<Suspense fallback={<LoadingPage />}>
						<Home />
					</Suspense>
				),
				errorElement: (
					<Suspense fallback={<LoadingPage />}>
						<ErrorPage />
					</Suspense>
				),
				children: [
					{
						index: true,
						element: (
							<Suspense fallback={<LoadingPage />}>
								<HomeMain />
							</Suspense>
						),
					},
					{
						path: 'addStatement',
						element: (
							<Suspense fallback={<LoadingPage />}>
								<AddStatement />
							</Suspense>
						),
					},
				],
			},
			{
				path: 'member-rejection',
				element: (
					<Suspense fallback={<LoadingPage />}>
						<MemberRejection />
					</Suspense>
				),
			},
			{
				path: 'login-first',
				element: (
					<Suspense fallback={<LoadingPage />}>
						<LoginPage />
					</Suspense>
				),
			},
			{
				path: 'statement/:statementId',
				element: (
					<Suspense fallback={<LoadingPage />}>
						<StatementMain />
					</Suspense>
				),
				children: [
					{
						path: ':screen',
						element: (
							<Suspense fallback={<LoadingPage />}>
								<StatementMain />
							</Suspense>
						),
					},
				],
			},
			{
				path: 'statement/:statementId/:page',
				element: (
					<Suspense fallback={<LoadingPage />}>
						<StatementMain />
					</Suspense>
				),
				children: [
					{
						path: ':sort',
						element: (
							<Suspense fallback={<LoadingPage />}>
								<StatementMain />
							</Suspense>
						),
					},
				],
			},
			{
				path: 'stage/:stageId',
				element: (
					<Suspense fallback={<LoadingPage />}>
						<Stage />
					</Suspense>
				),
			},
			{
				path: 'statement-an/:anonymous/:statementId/:page',
				element: (
					<Suspense fallback={<LoadingPage />}>
						<StatementMain />
					</Suspense>
				),
				children: [
					{
						path: ':sort',
						element: (
							<Suspense fallback={<LoadingPage />}>
								<StatementMain />
							</Suspense>
						),
					},
				],
			},
			{
				path: '401',
				element: (
					<Suspense fallback={<LoadingPage />}>
						<Page401 />
					</Suspense>
				),
			},
		],
	},
	{
		path: 'mass-consensus/:statementId',
		children: [
			{
				index: true, // This will be the default route
				element: (
					<Suspense fallback={<LoadingPage />}>
						<Introduction />
					</Suspense>
				),
			},
			{
				path: MassConsensusPageUrls.introduction,
				element: (
					<Suspense fallback={<LoadingPage />}>
						<Introduction />
					</Suspense>
				),
			},
			{
				path: MassConsensusPageUrls.initialQuestion,
				element: (
					<Suspense fallback={<LoadingPage />}>
						<InitialQuestion />
					</Suspense>
				),
			},
			{
				path: MassConsensusPageUrls.similarSuggestions,
				element: (
					<Suspense fallback={<LoadingPage />}>
						<SimilarSuggestions />
					</Suspense>
				),
			},
			{
				path: MassConsensusPageUrls.randomSuggestions,
				element: (
					<Suspense fallback={<LoadingPage />}>
						<RandomSuggestions />
					</Suspense>
				),
			},
			{
				path: MassConsensusPageUrls.topSuggestions,
				element: (
					<Suspense fallback={<LoadingPage />}>
						<TopSuggestions />
					</Suspense>
				),
			},
			{
				path: MassConsensusPageUrls.voting,
				element: <Suspense fallback={<LoadingPage />}><VotingSuggestions /></Suspense>,
			}
		]
	},
	{
		path: '404',
		element: (
			<Suspense fallback={<LoadingPage />}>
				<Page404 />
			</Suspense>
		),
	},
	{
		path: '*',
		element: (
			<Suspense fallback={<LoadingPage />}>
				<Page404 />
			</Suspense>
		),
	},
]);
