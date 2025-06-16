import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { QuestionType, Statement, StatementType } from 'delib-npm';

interface NewStatementState {
	parentStatement: Statement | null;
	newStatementType: StatementType;
	newQuestionType?: QuestionType | null; // Optional, can be set when creating a question
	isLoading: boolean;
	error: string | null;
	showModal: boolean;
}

const initialState: NewStatementState = {
	parentStatement: null,
	newStatementType: StatementType.group, // Default type can be set to group or any other type
	newQuestionType: null, // Initially no question type is set
	isLoading: false,
	error: null,
	showModal: false,
};

const newStatementSlice = createSlice({
	name: 'newStatement',
	initialState,
	reducers: {
		setParentStatement: (state, action: PayloadAction<Statement | null>) => {
			state.parentStatement = action.payload;
		},
		setNewStatementType: (state, action: PayloadAction<StatementType>) => {
			state.newStatementType = action.payload;
		},
		setNewQuestionType: (state, action: PayloadAction<QuestionType | null>) => {
			state.newQuestionType = action.payload;
			if (action.payload) {
				state.newStatementType = StatementType.question; // Set type to question if a question type is provided
			}
		},
		clearNewStatement: (state) => {
			state.parentStatement = null;
		},
		setLoading: (state, action: PayloadAction<boolean>) => {
			state.isLoading = action.payload;
		},
		setError: (state, action: PayloadAction<string | null>) => {
			state.error = action.payload;
		},
		resetNewStatement: (state) => {
			state.parentStatement = null;
			state.isLoading = false;
			state.error = null;
		},
		setShowNewStatementModal: (state, action: PayloadAction<boolean>) => {
			state.showModal = action.payload;
		},
	},
});

export const {
	setParentStatement,
	setNewStatementType,
	setNewQuestionType,
	clearNewStatement,
	setLoading,
	setError,
	resetNewStatement,
	setShowNewStatementModal,
} = newStatementSlice.actions;

export const selectParentStatementForNewStatement = (state: { newStatement: NewStatementState }) =>
	state.newStatement.parentStatement;

export const selectNewStatementLoading = (state: { newStatement: NewStatementState }) =>
	state.newStatement.isLoading;

export const selectNewStatementError = (state: { newStatement: NewStatementState }) =>
	state.newStatement.error;

export const selectNewStatementShowModal = (state: { newStatement: NewStatementState }) =>
	state.newStatement.showModal;

export const selectNewStatementType = (state: { newStatement: NewStatementState }) =>
	state.newStatement.newStatementType;

export const selectNewQuestionType = (state: { newStatement: NewStatementState }) =>
	state.newStatement.newQuestionType;

export default newStatementSlice.reducer;