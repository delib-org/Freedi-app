import { RouteObject } from 'react-router';
import { MassConsensusPageUrls } from 'delib-npm';
import { lazy } from 'react';
import withSuspense from './withSuspense';

const MassConsensus = lazy(() => import('@/view/pages/massConsensus/MassConsensus'));

const Introduction = lazy(
	() => import('@/view/pages/massConsensus/introduction/Introduction')
);
const MassConsensusQuestion = lazy(
	() => import('@/view/pages/massConsensus/massConsesusQuestion/MassConsesusQuestion')
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

const LeaveFeedback = lazy(
	() => import('@/view/pages/massConsensus/leaveFeedback/LeaveFeedback')
);

const MassConsensusMySuggestions = lazy(
	() => import('@/view/pages/massConsensus/mySuggestions/MassConsensusMySuggestions')
);

export const massConsensusRoutes: RouteObject[] = [
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
				path: MassConsensusPageUrls.leaveFeedback,
				element: withSuspense(LeaveFeedback),
			},
			{
				path: 'my-suggestions',
				element: withSuspense(MassConsensusMySuggestions),
			},
		],
	},
];
