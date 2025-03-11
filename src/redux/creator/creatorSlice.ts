import { Creator } from '@/types/user/User';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface CreatorState {
	creator: Creator | null;
}

const initialState: CreatorState = {
	creator: null,
};

const creatorSlice = createSlice({
	name: 'creator',
	initialState,
	reducers: {
		setCreator: (state, action: PayloadAction<Creator>) => {
			state.creator = action.payload;
		},
		removeCreator: (state) => {
			state.creator = null;
		}
	},
});

export const { setCreator, removeCreator } = creatorSlice.actions;

export const selectCreator = (state: { creator: CreatorState }) => state.creator.creator;

export default creatorSlice.reducer;