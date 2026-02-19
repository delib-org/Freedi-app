import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { PolarizationIndex, updateArray, UserDemographicQuestion } from '@freedi/shared-types';

// Use string literal for scope until delib-npm exports the enum value
const DEMOGRAPHIC_SCOPE_GROUP = 'group' as const;

interface GroupDemographicModalState {
	show: boolean;
	topParentId: string | null;
}

interface UserDemographicState {
	userDemographicQuestions: UserDemographicQuestion[];
	userDemographic: UserDemographicQuestion[];
	polarizationIndexes: PolarizationIndex[];
	showGroupDemographicModal: GroupDemographicModalState;
}

const initialState: UserDemographicState = {
	userDemographicQuestions: [],
	userDemographic: [],
	polarizationIndexes: [],
	showGroupDemographicModal: {
		show: false,
		topParentId: null,
	},
};

export const userDemographicSlice = createSlice({
	name: 'userDemographic',
	initialState,
	reducers: {
		setUserDemographicQuestion: (state, action: PayloadAction<UserDemographicQuestion>) => {
			state.userDemographicQuestions = updateArray(
				state.userDemographicQuestions,
				action.payload,
				'userQuestionId',
			);
		},

		deleteUserDemographicQuestion: (state, action: PayloadAction<string>) => {
			state.userDemographicQuestions = state.userDemographicQuestions.filter(
				(q) => q.userQuestionId !== action.payload,
			);
		},
		setUserDemographicQuestions: (state, action: PayloadAction<UserDemographicQuestion[]>) => {
			state.userDemographicQuestions = action.payload;
		},
		updateUserDemographicQuestionOptionColor: (
			state,
			action: PayloadAction<{ userQuestionId: string; option: string; color: string }>,
		) => {
			const { userQuestionId, option, color } = action.payload;
			const question = state.userDemographicQuestions.find(
				(q) => q.userQuestionId === userQuestionId,
			);
			if (question) {
				const optionToUpdate = question.options.find((opt) => opt.option === option);
				if (optionToUpdate) {
					optionToUpdate.color = color;
				}
			}
		},
		setUserDemographic: (state, action: PayloadAction<UserDemographicQuestion>) => {
			state.userDemographic = updateArray(state.userDemographic, action.payload, 'userQuestionId');
		},
		deleteUserDemographic: (state, action: PayloadAction<string>) => {
			state.userDemographic = state.userDemographic.filter(
				(q) => q.userQuestionId !== action.payload,
			);
		},
		setPolarizationIndexes: (state, action: PayloadAction<PolarizationIndex>) => {
			state.polarizationIndexes = updateArray(
				state.polarizationIndexes,
				action.payload,
				'statementId',
			);
		},
		deletePolarizationIndex: (state, action: PayloadAction<string>) => {
			state.polarizationIndexes = state.polarizationIndexes.filter(
				(pi) => pi.statementId !== action.payload,
			);
		},
		setShowGroupDemographicModal: (state, action: PayloadAction<GroupDemographicModalState>) => {
			state.showGroupDemographicModal = action.payload;
		},
		hideGroupDemographicModal: (state) => {
			state.showGroupDemographicModal = { show: false, topParentId: null };
		},
	},
});

export const {
	setUserDemographicQuestion,
	deleteUserDemographicQuestion,
	setUserDemographicQuestions,
	setUserDemographic,
	deleteUserDemographic,
	setPolarizationIndexes,
	deletePolarizationIndex,
	updateUserDemographicQuestionOptionColor,
	setShowGroupDemographicModal,
	hideGroupDemographicModal,
} = userDemographicSlice.actions;

// Selectors use narrowly-typed state parameter to avoid circular dependencies with store.ts
export const selectUserDemographicQuestionsByStatementId = (statementId: string) =>
	createSelector(
		[
			(state: { userDemographic: UserDemographicState }) =>
				state.userDemographic.userDemographicQuestions,
		],
		(userDemographicQuestions) =>
			userDemographicQuestions.filter((question) => question.statementId === statementId),
	);

export const selectUserDemographicByStatementId = (statementId: string) =>
	createSelector(
		[(state: { userDemographic: UserDemographicState }) => state.userDemographic.userDemographic],
		(userDemographic) => userDemographic.filter((data) => data.statementId === statementId),
	);

export const selectPolarizationIndexByParentId = (parentId: string) =>
	createSelector(
		[
			(state: { userDemographic: UserDemographicState }) =>
				state.userDemographic.polarizationIndexes,
		],
		(polarizationIndexes) => polarizationIndexes.filter((pi) => pi.parentId === parentId),
	);

// Group-level demographic selectors
export const selectGroupQuestions = (topParentId: string) =>
	createSelector(
		[
			(state: { userDemographic: UserDemographicState }) =>
				state.userDemographic.userDemographicQuestions,
		],
		(questions) =>
			questions.filter((q) => q.topParentId === topParentId && q.scope === DEMOGRAPHIC_SCOPE_GROUP),
	);

// Select effective questions (group + statement merged)
export const selectEffectiveQuestions = (statementId: string, topParentId: string) =>
	createSelector(
		[
			(state: { userDemographic: UserDemographicState }) =>
				state.userDemographic.userDemographicQuestions,
		],
		(questions) => {
			const groupQ = questions.filter(
				(q) => q.topParentId === topParentId && q.scope === DEMOGRAPHIC_SCOPE_GROUP,
			);
			const statementQ = questions.filter(
				(q) => q.statementId === statementId && q.scope !== DEMOGRAPHIC_SCOPE_GROUP,
			);

			return [...groupQ, ...statementQ];
		},
	);

// Select user's group-level answers
export const selectUserGroupAnswers = (topParentId: string) =>
	createSelector(
		[(state: { userDemographic: UserDemographicState }) => state.userDemographic.userDemographic],
		(answers) =>
			answers.filter((a) => a.topParentId === topParentId && a.scope === DEMOGRAPHIC_SCOPE_GROUP),
	);

// Check unanswered group questions
export const selectUnansweredGroupQuestions = (topParentId: string) =>
	createSelector(
		[
			(state: { userDemographic: UserDemographicState }) =>
				selectGroupQuestions(topParentId)(state),
			(state: { userDemographic: UserDemographicState }) => state.userDemographic.userDemographic,
		],
		(questions, answers) =>
			questions.filter((q) => !answers.find((a) => a.userQuestionId === q.userQuestionId)),
	);

// Select group demographic modal state
export const selectShowGroupDemographicModal = (state: { userDemographic: UserDemographicState }) =>
	state.userDemographic.showGroupDemographicModal;
