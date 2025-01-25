import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../store';

interface InitLocationState {
	path: string;
}

const initialState: InitLocationState = {
	path: '',
};

export const initLocationSlice = createSlice({
	name: 'initLocation',
	initialState,
	reducers: {
		setInitLocation: (state, action: PayloadAction<string>) => {
			state.path = action.payload;
		},
	},
});

export const { setInitLocation } = initLocationSlice.actions;

export const selectInitLocation = (state: RootState) => state.initLocation.path;

export default initLocationSlice.reducer;
