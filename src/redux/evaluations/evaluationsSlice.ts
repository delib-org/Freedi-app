import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { Evaluation, EvaluationSchema, updateArray } from 'delib-npm';
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
				state.userEvaluations = updateArray(
					state.userEvaluations,
					newEvaluation,
					'evaluationId'
				);
			} catch (error) {
				console.error(error);
			}
		},
		resetEvaluations: (state) => {
			state.userEvaluations = [];
		},
	},
});

export const { setEvaluationToStore, resetEvaluations } =
	evaluationsSlicer.actions;

export const evaluationsSelector = (state: RootState) =>
	state.evaluations.userEvaluations;
export const evaluationsParentSelector =
	(parentId: string | undefined) => (state: RootState) =>
		state.evaluations.userEvaluations.filter(
			(evaluation) => evaluation.parentId === parentId
		);
export const evaluationSelector =
	(statementId: string | undefined, creatorId?: string) => (state: RootState): number | undefined => {
		const _creatorId = creatorId ?? state.creator.creator?.uid;

		return state.evaluations.userEvaluations.find(
			(evaluation) => evaluation.statementId === statementId && evaluation.evaluatorId === _creatorId
		)?.evaluation;
	}

export default evaluationsSlicer.reducer;
