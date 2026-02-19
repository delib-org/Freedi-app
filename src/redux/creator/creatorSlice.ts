import { Creator } from '@freedi/shared-types';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface CreatorState {
	creator: Creator | null;
}

const initialState: CreatorState = {
	creator: null,
};

export const creatorSlice = createSlice({
	name: 'creator',
	initialState,
	reducers: {
		setCreator: (state, action: PayloadAction<Creator>) => {
			state.creator = action.payload;
		},
		setUserAdvanceUser: (state, action: PayloadAction<boolean>) => {
			if (state.creator) {
				state.creator.advanceUser = action.payload;
			}
		},
		removeCreator: (state) => {
			state.creator = null;
		},
	},
});

export const { setCreator, removeCreator, setUserAdvanceUser } = creatorSlice.actions;

export const creatorSelector = (state: { creator: CreatorState }) => state.creator.creator;
