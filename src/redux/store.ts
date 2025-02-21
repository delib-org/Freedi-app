import { configureStore } from '@reduxjs/toolkit';
import { evaluationsSlicer } from './evaluations/evaluationsSlice';
import { historySlice } from './history/HistorySlice';
import { initLocationSlice } from './location/locationSlice';
import { resultsSlice } from './results/resultsSlice';
import { statementMetaData } from './statements/statementsMetaSlice';
import { statementsSlicer } from './statements/statementsSlice';
import { userSlicer } from './users/userSlice';
import { votesSlicer } from './vote/votesSlice';
import { choseBySlice } from './choseBy/choseBySlice';
import { massConsensusSlice } from './massConsensus/massConsensusSlice';
import { notificationsSlicer } from './notificationsSlice/notificationsSlice';

export const store = configureStore({
	reducer: {
		statements: statementsSlicer.reducer,
		statementMetaData: statementMetaData.reducer,
		evaluations: evaluationsSlicer.reducer,
		user: userSlicer.reducer,
		votes: votesSlicer.reducer,
		results: resultsSlice.reducer,
		initLocation: initLocationSlice.reducer,
		history: historySlice.reducer,
		choseBys: choseBySlice.reducer,
		massConsensus: massConsensusSlice.reducer,
		notifications: notificationsSlicer.reducer,
	},
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;

// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
