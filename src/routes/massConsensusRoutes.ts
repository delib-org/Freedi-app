import { RouteObject } from 'react-router';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import { lazy } from 'react';
import withSuspense from './withSuspense';

const Introduction = lazy(
	() => import('@/view/pages/massConsensus/introduction/Introduction')
);
const InitialQuestion = lazy(
	() => import('@/view/pages/massConsensus/initialQuestion/InitialQuestion')
);
const SimilarSuggestions = lazy(
	() =>
		import(
			'@/view/pages/massConsensus/similarSuggestions/SimilarSuggestions'
		)
);
const RandomSuggestions = lazy(
	() =>
		import('@/view/pages/massConsensus/randomSuggestions/RandomSuggestions')
);
const TopSuggestions = lazy(
	() => import('@/view/pages/massConsensus/topSuggestions/TopSuggestions')
);
const VotingSuggestions = lazy(
	() =>
		import('@/view/pages/massConsensus/votingSuggestions/VotingSuggestions')
);

export const massConsensusRoutes: RouteObject[] = [
	{
		path: 'mass-consensus/:statementId',
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
				path: MassConsensusPageUrls.initialQuestion,
				element: withSuspense(InitialQuestion),
			},
			{
				path: MassConsensusPageUrls.similarSuggestions,
				element: withSuspense(SimilarSuggestions),
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
		],
	},
];
