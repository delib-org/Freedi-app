import React from 'react';
import { render } from '@testing-library/react';
import type { RenderOptions } from '@testing-library/react';
import { configureStore, PreloadedState } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import type { RootState } from '@/redux/store';

// Import all your reducers
import { evaluationsSlicer } from '@/redux/evaluations/evaluationsSlice';
import { resultsSlice } from '@/redux/results/resultsSlice';
import { statementMetaData } from '@/redux/statements/statementsMetaSlice';
import { statementsSlicer, StatementScreen } from '@/redux/statements/statementsSlice';
import { votesSlicer } from '@/redux/vote/votesSlice';
import { choseBySlice } from '@/redux/choseBy/choseBySlice';
import { notificationsSlicer } from '@/redux/notificationsSlice/notificationsSlice';
import creatorReducer from '@/redux/creator/creatorSlice';
import SubscriptionsReducer from '@/redux/subscriptions/subscriptionsSlice';
import userDemographicReducer from '@/redux/userDemographic/userDemographicSlice';
import newStatementReducer from '@/redux/statements/newStatementSlice';

interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
	preloadedState?: PreloadedState<RootState>;
	store?: ReturnType<typeof configureStore>;
}

export function renderWithProviders(
	ui: React.ReactElement,
	{
		preloadedState,
		store = configureStore({
			reducer: {
				statements: statementsSlicer.reducer,
				statementMetaData: statementMetaData.reducer,
				evaluations: evaluationsSlicer.reducer,
				votes: votesSlicer.reducer,
				results: resultsSlice.reducer,
				choseBys: choseBySlice.reducer,
				notifications: notificationsSlicer.reducer,
				creator: creatorReducer,
				subscriptions: SubscriptionsReducer.reducer,
				userDemographic: userDemographicReducer,
				newStatement: newStatementReducer,
			},
			preloadedState,
		}),
		...renderOptions
	}: ExtendedRenderOptions = {},
) {
	function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
		return <Provider store={store}>{children}</Provider>;
	}

	return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}

export const getMockRootState = (overrides: Partial<RootState> = {}): RootState => {
	// Create the base mock state
	const baseMockState = {
		statements: {
			statements: [],
			statementSubscription: [],
			statementSubscriptionLastUpdate: 0,
			statementMembership: [],
			screen: StatementScreen.chat,
		},
		statementMetaData: {
			statementsMetaData: [],
		},
		evaluations: {
			userEvaluations: [],
		},
		votes: {
			votes: [],
		},
		results: {
			results: [],
		},
		choseBys: {
			statements: [],
		},
		notifications: {
			inAppNotifications: [],
		},
		creator: {
			creator: null,
		},
		subscriptions: {
			waitingList: [],
		},
		userDemographic: {
			userDemographicQuestions: [],
			userDemographic: [],
			polarizationIndexes: [],
		},
		newStatement: {
			parentStatement: null,
			newStatement: null,
			isLoading: false,
			error: null,
			showModal: false,
		},
	};

	// Merge with overrides
	return {
		...baseMockState,
		...overrides,
	} as RootState;
};
