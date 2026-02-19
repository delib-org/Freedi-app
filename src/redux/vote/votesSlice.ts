import { createSlice, createSelector } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { Statement, StatementSchema, Vote, getVoteId, updateArray } from '@freedi/shared-types';
import { parse } from 'valibot';
import { normalizeStatementData } from '@/helpers/timestampHelpers';
import { logError } from '@/utils/errorHandling';

// Define a type for the slice state
interface VotesState {
	votes: Vote[];
}

// Define the initial state using that type
const initialState: VotesState = {
	votes: [],
};

export const votesSlicer = createSlice({
	name: 'votes',
	initialState,
	reducers: {
		setVoteToStore: (state, action: PayloadAction<Statement>) => {
			try {
				const statement = parse(StatementSchema, normalizeStatementData(action.payload));

				const newVote: Vote = {
					statementId: statement.statementId,
					userId: statement.creator.uid,
					parentId: statement.parentId,
					voteId: getVoteId(statement.creator.uid, statement.parentId),
					createdAt: new Date().getTime(),
					lastUpdate: new Date().getTime(),
				};
				const oldVote = state.votes.find((vote) => vote.voteId === newVote.voteId);
				if (!oldVote) {
					state.votes = updateArray(state.votes, newVote, 'parentId');
				} else {
					const isSameOption = newVote.statementId === oldVote?.statementId;
					if (isSameOption) newVote.statementId = 'none';
					state.votes = updateArray(state.votes, newVote, 'parentId');
				}
			} catch (error) {
				logError(error, { operation: 'redux.vote.votesSlice.oldVote' });
			}
		},
		resetVotes: (state) => {
			state.votes = [];
		},
	},
});

export const { setVoteToStore, resetVotes } = votesSlicer.actions;

export const votesSelector = (state: { votes: VotesState }) => state.votes.votes;

// Memoized selector factory for finding vote by parentId
// This prevents O(N) find operations on every render
export const parentVoteSelector = (parentId: string | undefined) =>
	createSelector([votesSelector], (votes) => votes.find((vote) => vote.parentId === parentId));

export default votesSlicer.reducer;
