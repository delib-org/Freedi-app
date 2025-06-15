import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Statement } from 'delib-npm';

interface NewStatementState {
	newStatement: Partial<Statement>;
	isLoading: boolean;
	error: string | null;
}

const initialState: NewStatementState = {
	newStatement: {},
	isLoading: false,
	error: null,
};

const newStatementSlice = createSlice({
	name: 'newStatement',
	initialState,
	reducers: {
		setNewStatement: (state, action: PayloadAction<Partial<Statement>>) => {
			state.newStatement = { ...state.newStatement, ...action.payload };
		},
		clearNewStatement: (state) => {
			state.newStatement = {};
		},
		setLoading: (state, action: PayloadAction<boolean>) => {
			state.isLoading = action.payload;
		},
		setError: (state, action: PayloadAction<string | null>) => {
			state.error = action.payload;
		},
		resetNewStatement: (state) => {
			state.newStatement = {};
			state.isLoading = false;
			state.error = null;
		},
	},
});

export const {
	setNewStatement,
	clearNewStatement,
	setLoading,
	setError,
	resetNewStatement,
} = newStatementSlice.actions;

export default newStatementSlice.reducer;