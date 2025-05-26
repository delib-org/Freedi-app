import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { updateArray, UserQuestion } from 'delib-npm';
import { RootState } from '../store';

interface UserDataState {
	userQuestions: UserQuestion[];
}

const initialState: UserDataState = {
	userQuestions: []
};

const userDataSlice = createSlice({
	name: 'userData',
	initialState,
	reducers: {
		setUserQuestion: (state, action: PayloadAction<UserQuestion>) => {
			state.userQuestions = updateArray(state.userQuestions, action.payload, 'userQuestionId');
		},

		deleteUserQuestion: (state, action: PayloadAction<number>) => {
			state.userQuestions.splice(action.payload, 1);
		},
		setUserQuestions: (state, action: PayloadAction<UserQuestion[]>) => {
			state.userQuestions = action.payload;
		}
	}
});

export const {
	setUserQuestion,
	deleteUserQuestion,
	setUserQuestions
} = userDataSlice.actions;

// Selectors
export const selectUserQuestionsByStatementId = createSelector(
	[(state: RootState) => state.userData.userQuestions, (_state: RootState, statementId: string) => statementId],
	(userQuestions, statementId) => userQuestions.filter(question => question.statementId === statementId)
);

export default userDataSlice.reducer;