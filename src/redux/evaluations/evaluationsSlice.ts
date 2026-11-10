import { createSelector, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { Evaluation, EvaluationSchema, updateArray } from '@freedi/shared-types';
import { parse } from 'valibot';
import { logError } from '@/utils/errorHandling';

// Define a type for the slice state
interface EvaluationsState {
	userEvaluations: Evaluation[];
}

// Minimal cross-slice type for selectors that access the creator slice
interface EvaluationsSliceRootState {
	evaluations: EvaluationsState;
	creator: { creator: { uid: string } | null };
}

// Define the initial state using that type
const initialState: EvaluationsState = {
	userEvaluations: [],
};

export const evaluationsSlice = createSlice({
	name: 'evaluations',
	initialState,
	reducers: {
		setEvaluationToStore: (state, action: PayloadAction<Evaluation>) => {
			try {
				const newEvaluation = parse(EvaluationSchema, action.payload);
				state.userEvaluations = updateArray(state.userEvaluations, newEvaluation, 'evaluationId');
			} catch (error) {
				logError(error, { operation: 'redux.evaluations.evaluationsSlice.unknown' });
			}
		},
		resetEvaluations: (state) => {
			state.userEvaluations = [];
		},
	},
});

export const { setEvaluationToStore, resetEvaluations } = evaluationsSlice.actions;

export const evaluationsSelector = (state: EvaluationsSliceRootState) =>
	state.evaluations.userEvaluations;

const NO_EVALUATIONS: Evaluation[] = [];

/** One pass per change of the ratings, so a list of cards does not scan them card by card. */
const selectEvaluationsByParent = createSelector([evaluationsSelector], (evaluations) => {
	const byParent = new Map<string, Evaluation[]>();
	evaluations.forEach((evaluation) => {
		const group = byParent.get(evaluation.parentId);
		if (group) group.push(evaluation);
		else byParent.set(evaluation.parentId, [evaluation]);
	});

	return byParent;
});

const evaluationKey = (statementId: string, evaluatorId: string | undefined): string =>
	`${evaluatorId}--${statementId}`;

const selectEvaluationValueByKey = createSelector([evaluationsSelector], (evaluations) => {
	const byKey = new Map<string, number>();
	evaluations.forEach((evaluation) => {
		const key = evaluationKey(evaluation.statementId, evaluation.evaluatorId);
		if (!byKey.has(key)) byKey.set(key, evaluation.evaluation);
	});

	return byKey;
});

export const evaluationsParentSelector =
	(parentId: string | undefined) => (state: EvaluationsSliceRootState) =>
		(parentId !== undefined && selectEvaluationsByParent(state).get(parentId)) || NO_EVALUATIONS;
export const evaluationSelector =
	(statementId: string | undefined, creatorId?: string) =>
	(state: EvaluationsSliceRootState): number | undefined => {
		if (statementId === undefined) return undefined;
		const evaluatorId = creatorId ?? state.creator.creator?.uid;

		return selectEvaluationValueByKey(state).get(evaluationKey(statementId, evaluatorId));
	};

export const numberOfEvaluatedStatements =
	(statementsIds: string[]) => (state: EvaluationsSliceRootState) => {
		const numberEvaluated = state.evaluations.userEvaluations.filter((evaluation) =>
			statementsIds.includes(evaluation.statementId),
		).length;

		return statementsIds.length - numberEvaluated;
	};

// Selector to count positive votes (value === 1) for a user within a parent statement
export const userVotesInParentSelector =
	(parentId: string | undefined, userId?: string) =>
	(state: EvaluationsSliceRootState): number => {
		if (!parentId) return 0;
		const evaluatorId = userId ?? state.creator.creator?.uid;

		return (selectEvaluationsByParent(state).get(parentId) ?? NO_EVALUATIONS).filter(
			(evaluation) => evaluation.evaluatorId === evaluatorId && evaluation.evaluation === 1, // Only count positive votes for single-like
		).length;
	};

// Selector to get all user's positive votes with statement IDs for a parent
export const userVotedStatementsInParentSelector =
	(parentId: string | undefined, userId?: string) =>
	(state: EvaluationsSliceRootState): string[] => {
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

export default evaluationsSlice.reducer;
