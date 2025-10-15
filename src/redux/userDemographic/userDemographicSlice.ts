import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { PolarizationIndex, updateArray, UserDemographicQuestion } from 'delib-npm';
import { RootState } from '../types';

interface UserDemographicState {
	userDemographicQuestions: UserDemographicQuestion[];
	userDemographic: UserDemographicQuestion[];
	polarizationIndexes: PolarizationIndex[];
}

const initialState: UserDemographicState = {
	userDemographicQuestions: [],
	userDemographic: [],
	polarizationIndexes: []
};

const userDemographicSlice = createSlice({
	name: 'userDemographic',
	initialState,
	reducers: {
		setUserDemographicQuestion: (state, action: PayloadAction<UserDemographicQuestion>) => {
			state.userDemographicQuestions = updateArray(state.userDemographicQuestions, action.payload, 'userQuestionId');
		},

		deleteUserDemographicQuestion: (state, action: PayloadAction<string>) => {
			state.userDemographicQuestions = state.userDemographicQuestions.filter(q => q.userQuestionId !== action.payload);
		},
		setUserDemographicQuestions: (state, action: PayloadAction<UserDemographicQuestion[]>) => {
			state.userDemographicQuestions = action.payload;
		},
		updateUserDemographicQuestionOptionColor: (state, action: PayloadAction<{ userQuestionId: string; option: string; color: string }>) => {
			const { userQuestionId, option, color } = action.payload;
			const question = state.userDemographicQuestions.find(q => q.userQuestionId === userQuestionId);
			if (question) {
				const optionToUpdate = question.options.find(opt => opt.option === option);
				if (optionToUpdate) {
					optionToUpdate.color = color;
				}
			}
		},
		setUserDemographic: (state, action: PayloadAction<UserDemographicQuestion>) => {
			state.userDemographic = updateArray(state.userDemographic, action.payload, 'userQuestionId');
		},
		deleteUserDemographic: (state, action: PayloadAction<string>) => {
			state.userDemographic = state.userDemographic.filter(q => q.userQuestionId !== action.payload);
		},
		setPolarizationIndexes: (state, action: PayloadAction<PolarizationIndex>) => {
			state.polarizationIndexes = updateArray(state.polarizationIndexes, action.payload, 'statementId');
		},
		deletePolarizationIndex: (state, action: PayloadAction<string>) => {
			state.polarizationIndexes = state.polarizationIndexes.filter(pi => pi.statementId !== action.payload);
		}
	}
});

export const {
	setUserDemographicQuestion,
	deleteUserDemographicQuestion,
	setUserDemographicQuestions,
	setUserDemographic,
	deleteUserDemographic,
	setPolarizationIndexes,
	deletePolarizationIndex,
	updateUserDemographicQuestionOptionColor
} = userDemographicSlice.actions;

// Selectors
export const selectUserDemographicQuestionsByStatementId = (statementId: string) => createSelector(
	[(state: RootState) => state.userDemographic.userDemographicQuestions],
	(userDemographicQuestions) => userDemographicQuestions.filter(question => question.statementId === statementId)
);

export const selectUserDemographicByStatementId = (statementId: string) => createSelector(
	[(state: RootState) => state.userDemographic.userDemographic],
	(userDemographic) => userDemographic.filter(data => data.statementId === statementId)
);

export const selectPolarizationIndexByParentId = (parentId: string) => createSelector(
	[(state: RootState) => state.userDemographic.polarizationIndexes],
	(polarizationIndexes) => polarizationIndexes.filter(pi => pi.parentId === parentId)
);

export default userDemographicSlice.reducer;