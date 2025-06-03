import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { PolarizationMetrics, updateArray, UserQuestion } from 'delib-npm';
import { RootState } from '../store';

interface UserDataState {
	userQuestions: UserQuestion[];
	userData: UserQuestion[];
	polarizationIndexes: PolarizationMetrics[];
}

const initialState: UserDataState = {
	userQuestions: [],
	userData: [],
	polarizationIndexes: []
};

const userDataSlice = createSlice({
	name: 'userData',
	initialState,
	reducers: {
		setUserQuestion: (state, action: PayloadAction<UserQuestion>) => {
			state.userQuestions = updateArray(state.userQuestions, action.payload, 'userQuestionId');
		},

		deleteUserQuestion: (state, action: PayloadAction<string>) => {
			state.userQuestions = state.userQuestions.filter(q => q.userQuestionId !== action.payload);
		},
		setUserQuestions: (state, action: PayloadAction<UserQuestion[]>) => {
			state.userQuestions = action.payload;
		},
		setUserData: (state, action: PayloadAction<UserQuestion>) => {
			state.userData = updateArray(state.userData, action.payload, 'userQuestionId');
		},
		deleteUserData: (state, action: PayloadAction<string>) => {
			state.userData = state.userData.filter(q => q.userQuestionId !== action.payload);
		},
		setPolarizationIndexes: (state, action: PayloadAction<PolarizationMetrics>) => {
			state.polarizationIndexes = updateArray(state.polarizationIndexes, action.payload, 'statementId');
		},
		deletePolarizationIndex: (state, action: PayloadAction<string>) => {
			state.polarizationIndexes = state.polarizationIndexes.filter(pi => pi.statementId !== action.payload);
		}
	}
});

export const {
	setUserQuestion,
	deleteUserQuestion,
	setUserQuestions,
	setUserData,
	deleteUserData,
	setPolarizationIndexes,
	deletePolarizationIndex
} = userDataSlice.actions;

// Selectors
export const selectUserQuestionsByStatementId = (statementId: string) => createSelector(
	[(state: RootState) => state.userData.userQuestions],
	(userQuestions) => userQuestions.filter(question => question.statementId === statementId)
);

export const selectUserDataByStatementId = (statementId: string) => createSelector(
	[(state: RootState) => state.userData.userData],
	(userData) => userData.filter(data => data.statementId === statementId)
);

export default userDataSlice.reducer;