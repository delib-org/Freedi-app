import { configureStore } from '@reduxjs/toolkit';
import { evaluationsSlicer } from './evaluations/evaluationsSlice';
import { resultsSlice } from './results/resultsSlice';
import { statementMetaData } from './statements/statementsMetaSlice';
import { statementsSlicer } from './statements/statementsSlice';
import { votesSlicer } from './vote/votesSlice';
import { choseBySlice } from './choseBy/choseBySlice';
import { notificationsSlicer } from './notificationsSlice/notificationsSlice';
import creatorReducer from './creator/creatorSlice';
import SubscriptionsReducer from './subscriptions/subscriptionsSlice';
import userDemographicReducer from './userDemographic/userDemographicSlice';
import newStatementReducer from './statements/newStatementSlice';
import pwaReducer from './pwa/pwaSlice';
import { roomAssignmentSlice } from './roomAssignment/roomAssignmentSlice';
import { fairEvalSlice } from './fairEval/fairEvalSlice';

export const store = configureStore({
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
		pwa: pwaReducer,
		roomAssignment: roomAssignmentSlice.reducer,
		fairEval: fairEvalSlice.reducer,
	},
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
