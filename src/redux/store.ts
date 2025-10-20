import { configureStore } from '@reduxjs/toolkit';
import { evaluationsSlicer } from './evaluations/evaluationsSlice';
import { resultsSlice } from './results/resultsSlice';
import { statementMetaData } from './statements/statementsMetaSlice';
import { statementsSlicer } from './statements/statementsSlice';
import { votesSlicer } from './vote/votesSlice';
import { choseBySlice } from './choseBy/choseBySlice';
import { massConsensusSlice } from './massConsensus/massConsensusSlice';
import { notificationsSlicer } from './notificationsSlice/notificationsSlice';
import creatorReducer from './creator/creatorSlice';
import SubscriptionsReducer from './subscriptions/subscriptionsSlice';
import userDemographicReducer from './userDemographic/userDemographicSlice';
import newStatementReducer from './statements/newStatementSlice';
import { massConsensusApi } from './massConsensus/massConsensusApi';

export const store = configureStore({
	reducer: {
		statements: statementsSlicer.reducer,
		statementMetaData: statementMetaData.reducer,
		evaluations: evaluationsSlicer.reducer,
		votes: votesSlicer.reducer,
		results: resultsSlice.reducer,
		choseBys: choseBySlice.reducer,
		massConsensus: massConsensusSlice.reducer,
		notifications: notificationsSlicer.reducer,
		creator: creatorReducer,
		subscriptions: SubscriptionsReducer.reducer,
		userDemographic: userDemographicReducer,
		newStatement: newStatementReducer,
	middleware: (getDefaultMiddleware) =>
		getDefaultMiddleware().concat(massConsensusApi.middleware),
	},
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
