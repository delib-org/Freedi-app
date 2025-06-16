import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { QuestionType, Statement, StatementType } from 'delib-npm';

interface NewStatementState {
	parentStatement: Statement | null | "top";
	newStatement: Partial<Statement> | null;
	isLoading: boolean;
	error: string | null;
	showModal: boolean;
}

const initialState: NewStatementState = {
	parentStatement: null,
	newStatement: null,
	isLoading: false,
	error: null,
	showModal: false,
};

const newStatementSlice = createSlice({
	name: 'newStatement',
	initialState,
	reducers: {
		setNewStatementModal: (state, action: PayloadAction<NewStatementState>) => {
			state = action.payload;
		},
		setParentStatement: (state, action: PayloadAction<Statement | null | "top">) => {
			state.parentStatement = action.payload;
		},
		setNewStatementType: (state, action: PayloadAction<StatementType>) => {
			state.newStatement = {
				...state.newStatement,
				statementType: action.payload
			};
		},
		setNewQuestionType: (state, action: PayloadAction<QuestionType | null>) => {
			state.newStatement = {
				...state.newStatement,
				questionSettings: {
					...state.newStatement?.questionSettings,
					questionType: action.payload || QuestionType.multiStage, // Default to multi-stage if no type is provided
				}
			};

		},
		clearNewStatement: (state) => {
			state.parentStatement = null;
			state.newStatement = null;
			state.isLoading = false;
			state.error = null;
			state.showModal = false;
		},
		setLoading: (state, action: PayloadAction<boolean>) => {
			state.isLoading = action.payload;
		},
		setError: (state, action: PayloadAction<string | null>) => {
			state.error = action.payload;
		},
		setShowNewStatementModal: (state, action: PayloadAction<boolean>) => {
			state.showModal = action.payload;
		},
	},
});

export const {
	setNewStatementModal,
	setParentStatement,
	setNewStatementType,
	setNewQuestionType,
	clearNewStatement,
	setLoading,
	setError,
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

export const selectNewStatement = (state: { newStatement: NewStatementState }) =>
	state.newStatement.newStatement;

export default newStatementSlice.reducer;