import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { UserQuestion } from 'delib-npm';
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
		addUserQuestion: (state, action: PayloadAction<UserQuestion>) => {
			state.userQuestions.push(action.payload);
		},
		updateUserQuestion: (state, action: PayloadAction<{ index: number; userQuestion: Partial<UserQuestion> }>) => {
			const { index, userQuestion } = action.payload;
			if (state.userQuestions[index]) {
				state.userQuestions[index] = { ...state.userQuestions[index], ...userQuestion };
			}
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
	addUserQuestion,
	updateUserQuestion,
	deleteUserQuestion,
	setUserQuestions
} = userDataSlice.actions;

// Selectors
export const selectUserQuestionsByStatementId = createSelector(
	[(state: RootState) => state.userData.userQuestions, (_state: RootState, statementId: string) => statementId],
	(userQuestions, statementId) => userQuestions.filter(question => question.statementId === statementId)
);

export default userDataSlice.reducer;