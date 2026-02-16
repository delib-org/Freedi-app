import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../types';
import { Evaluation, EvaluationSchema, updateArray } from '@freedi/shared-types';
import { parse } from 'valibot';

// Define a type for the slice state
interface EvaluationsState {
	userEvaluations: Evaluation[];
}

// Define the initial state using that type
const initialState: EvaluationsState = {
	userEvaluations: [],
};

export const evaluationsSlicer = createSlice({
	name: 'evaluations',
	initialState,
	reducers: {
		setEvaluationToStore: (state, action: PayloadAction<Evaluation>) => {
			try {
				const newEvaluation = parse(EvaluationSchema, action.payload);
				state.userEvaluations = updateArray(state.userEvaluations, newEvaluation, 'evaluationId');
			} catch (error) {
				console.error(error);
			}
		},
		resetEvaluations: (state) => {
			state.userEvaluations = [];
		},
	},
});

export const { setEvaluationToStore, resetEvaluations } = evaluationsSlicer.actions;

export const evaluationsSelector = (state: RootState) => state.evaluations.userEvaluations;
export const evaluationsParentSelector = (parentId: string | undefined) => (state: RootState) =>
	state.evaluations.userEvaluations.filter((evaluation) => evaluation.parentId === parentId);
export const evaluationSelector =
	(statementId: string | undefined, creatorId?: string) =>
	(state: RootState): number | undefined => {
		const _creatorId = creatorId ?? state.creator.creator?.uid;

		return state.evaluations.userEvaluations.find(
			(evaluation) =>
				evaluation.statementId === statementId && evaluation.evaluatorId === _creatorId,
		)?.evaluation;
	};

export const numberOfEvaluatedStatements = (statementsIds: string[]) => (state: RootState) => {
	const numberEvaluated = state.evaluations.userEvaluations.filter((evaluation) =>
		statementsIds.includes(evaluation.statementId),
	).length;

	return statementsIds.length - numberEvaluated;
};

// Selector to count positive votes (value === 1) for a user within a parent statement
export const userVotesInParentSelector =
	(parentId: string | undefined, userId?: string) =>
	(state: RootState): number => {
		if (!parentId) return 0;
		const evaluatorId = userId ?? state.creator.creator?.uid;

		return state.evaluations.userEvaluations.filter(
			(evaluation) =>
				evaluation.parentId === parentId &&
				evaluation.evaluatorId === evaluatorId &&
				evaluation.evaluation === 1, // Only count positive votes for single-like
		).length;
	};

// Selector to get all user's positive votes with statement IDs for a parent
export const userVotedStatementsInParentSelector =
	(parentId: string | undefined, userId?: string) =>
	(state: RootState): string[] => {
		if (!parentId) return [];
		const evaluatorId = userId ?? state.creator.creator?.uid;

		return state.evaluations.userEvaluations
			.filter(
				(evaluation) =>
					evaluation.parentId === parentId &&
					evaluation.evaluatorId === evaluatorId &&
					evaluation.evaluation === 1,
			)
			.map((evaluation) => evaluation.statementId);
	};

export default evaluationsSlicer.reducer;
