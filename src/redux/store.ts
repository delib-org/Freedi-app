import { configureStore } from '@reduxjs/toolkit';
import { evaluationsSlice } from './evaluations/evaluationsSlice';
import { resultsSlice } from './results/resultsSlice';
import { statementsMetaSlice } from './statements/statementsMetaSlice';
import { statementsSlice } from './statements/statementsSlice';
import { votesSlice } from './vote/votesSlice';
import { choseBySlice } from './choseBy/choseBySlice';
import { notificationsSlice } from './notificationsSlice/notificationsSlice';
import { creatorSlice } from './creator/creatorSlice';
import { subscriptionsSlice } from './subscriptions/subscriptionsSlice';
import { userDemographicSlice } from './userDemographic/userDemographicSlice';
import { newStatementSlice } from './statements/newStatementSlice';
import { pwaSlice } from './pwa/pwaSlice';
import { roomAssignmentSlice } from './roomAssignment/roomAssignmentSlice';

export const store = configureStore({
	reducer: {
		statements: statementsSlice.reducer,
		statementMetaData: statementsMetaSlice.reducer,
		evaluations: evaluationsSlice.reducer,
		votes: votesSlice.reducer,
		results: resultsSlice.reducer,
		choseBys: choseBySlice.reducer,
		notifications: notificationsSlice.reducer,
		creator: creatorSlice.reducer,
		subscriptions: subscriptionsSlice.reducer,
		userDemographic: userDemographicSlice.reducer,
		newStatement: newStatementSlice.reducer,
		pwa: pwaSlice.reducer,
		roomAssignment: roomAssignmentSlice.reducer,
	},
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
