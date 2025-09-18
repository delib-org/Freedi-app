import React from 'react';
import { RouteObject } from 'react-router';
import { MassConsensusPageUrls } from 'delib-npm';

import MassConsensus from '@/view/pages/massConsensus/MassConsensus';
import Introduction from '@/view/pages/massConsensus/introduction/Introduction';
import MassConsensusQuestion from '@/view/pages/massConsensus/massConsesusQuestion/MassConsesusQuestion';
import RandomSuggestions from '@/view/pages/massConsensus/randomSuggestions/RandomSuggestions';
import TopSuggestions from '@/view/pages/massConsensus/topSuggestions/TopSuggestions';
import VotingSuggestions from '@/view/pages/massConsensus/votingSuggestions/VotingSuggestions';
import LeaveFeedback from '@/view/pages/massConsensus/leaveFeedback/LeaveFeedback';
import MassConsensusMySuggestions from '@/view/pages/massConsensus/mySuggestions/MassConsensusMySuggestions';
// import ThankYou from '@/view/pages/massConsensus/thankYou/ThankYou';
import ThankYou from '@/view/pages/massConsensus/thankYouTest/ThankYouTest';

export const massConsensusRoutes: RouteObject[] = [
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
			{
				path: 'my-suggestions',
				element: <MassConsensusMySuggestions />,
			},
			{
				path: '*',
				element: <div>Catch all route - Path not found</div>,
			},
		],
	},
];
