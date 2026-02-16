import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { RootState } from '../types';
import { WaitingMember } from '@freedi/shared-types';

interface SubscriptionsState {
	waitingList: WaitingMember[];
}

const initialState: SubscriptionsState = {
	waitingList: [],
};

export const statementsSlicer = createSlice({
	name: 'subscriptions',
	initialState,
	reducers: {
		setWaitingMember: (state, action: PayloadAction<WaitingMember>) => {
			const newWaitingMember = action.payload;
			const existingWaitingMember = state.waitingList.find(
				(waiting) => waiting.statementsSubscribeId === newWaitingMember.statementsSubscribeId,
			);
			if (existingWaitingMember) {
				// Update the existing waiting list item with the new data
				Object.assign(existingWaitingMember, newWaitingMember);
			} else {
				// Add the new waiting list item to the state
				state.waitingList.push(newWaitingMember);
			}
		},
		removeWaitingMember: (state, action: PayloadAction<string>) => {
			const subscriptionId = action.payload;
			state.waitingList = state.waitingList.filter(
				(waiting: WaitingMember) => waiting.statementsSubscribeId !== subscriptionId,
			);
		},
		clearWaitingMember: (state) => {
			state.waitingList = [];
		},
	},
});

const getWaitingList = (state: RootState) => state.subscriptions.waitingList;
const getCreatorUid = (state: RootState) => state.creator.creator?.uid;

export const { setWaitingMember, removeWaitingMember, clearWaitingMember } =
	statementsSlicer.actions;
export const selectWaitingMember = createSelector(
	[getWaitingList, getCreatorUid],
	(waitingList, creatorUid) => waitingList.filter((waiting) => waiting.adminId === creatorUid),
);
export const selectWaitingMemberByStatementId = (statementId: string) => (state: RootState) => {
	return state.subscriptions.waitingList.filter((waiting) => waiting.statementId === statementId);
};

export default statementsSlicer;
