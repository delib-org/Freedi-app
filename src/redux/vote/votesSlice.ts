import { createSlice, createSelector } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { Vote, getVoteId, updateArray } from '@freedi/shared-types';
import { getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError, ValidationError } from '@/utils/errorHandling';

// Define a type for the slice state
interface VotesState {
	votes: Vote[];
}

export interface SetVotePayload {
	/** The question the vote belongs to. */
	parentId: string;
	/** The chosen option, or 'none' when the vote is withdrawn. */
	optionId: string;
	/** The voting user - not the option's author. */
	userId: string;
}

// Define the initial state using that type
const initialState: VotesState = {
	votes: [],
};

export const votesSlice = createSlice({
	name: 'votes',
	initialState,
	reducers: {
		/**
		 * Stores the user's vote for a question. The caller decides what the new
		 * value is (including 'none' to withdraw) - this reducer never toggles,
		 * so loading the stored vote from the DB cannot flip it off again.
		 */
		setVoteToStore: (state, action: PayloadAction<SetVotePayload>) => {
			try {
				const { parentId, optionId, userId } = action.payload;
				if (!parentId || !optionId || !userId) {
					throw new ValidationError('Incomplete vote payload', {
						operation: 'redux.vote.votesSlice.setVoteToStore',
						metadata: { parentId, optionId, userId },
					});
				}

				const now = getCurrentTimestamp();
				const newVote: Vote = {
					statementId: optionId,
					userId,
					parentId,
					voteId: getVoteId(userId, parentId),
					createdAt: now,
					lastUpdate: now,
				};

				state.votes = updateArray(state.votes, newVote, 'parentId');
			} catch (error) {
				logError(error, { operation: 'redux.vote.votesSlice.setVoteToStore' });
			}
		},
		resetVotes: (state) => {
			state.votes = [];
		},
	},
});

export const { setVoteToStore, resetVotes } = votesSlice.actions;

export const votesSelector = (state: { votes: VotesState }) => state.votes.votes;

// Memoized selector factory for finding vote by parentId
// This prevents O(N) find operations on every render
export const parentVoteSelector = (parentId: string | undefined) =>
	createSelector([votesSelector], (votes) => votes.find((vote) => vote.parentId === parentId));

export default votesSlice.reducer;
