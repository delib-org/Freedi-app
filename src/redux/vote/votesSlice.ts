import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { Statement, StatementSchema, Vote, getVoteId, updateArray } from 'delib-npm';
import { parse } from 'valibot';

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
				const statement = parse(StatementSchema, action.payload);

				const newVote: Vote = {
					statementId: statement.statementId,
					userId: statement.creator.uid,
					parentId: statement.parentId,
					voteId: getVoteId(
						statement.creator.uid,
						statement.parentId
					),
					createdAt: new Date().getTime(),
					lastUpdate: new Date().getTime(),
				};
				const oldVote = state.votes.find(
					(vote) => vote.voteId === newVote.voteId
				);
				if (!oldVote) {
					state.votes = updateArray(state.votes, newVote, 'parentId');
				} else {
					const isSameOption =
						newVote.statementId === oldVote?.statementId;
					if (isSameOption) newVote.statementId = 'none';
					state.votes = updateArray(state.votes, newVote, 'parentId');
				}
			} catch (error) {
				console.error(error);
			}
		},
		resetVotes: (state) => {
			state.votes = [];
		},
	},
});

export const { setVoteToStore, resetVotes } = votesSlicer.actions;

export const votesSelector = (state: RootState) => state.votes.votes;

export const parentVoteSelector =
	(parentId: string | undefined) => (state: RootState) =>
		state.votes.votes.find((vote) => vote.parentId === parentId);

export default votesSlicer.reducer;
