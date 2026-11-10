import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * What a large question's answer views have fetched, beyond the windowed list.
 * The statements themselves live in the statements slice; this holds which ones
 * make up a view, so cards keep reading the live documents.
 */

/** The batch of answers this person is rating now. */
export interface RateBatchEntry {
	ids: string[];
	hasMore: boolean;
	/** Answers still to serve after this batch. */
	remaining: number;
}

export interface AnswerViewsState {
	rateBatches: Record<string, RateBatchEntry>;
	/** Questions that fall back to the plain list: the sampler failed or found 30 answers or fewer. */
	plainListQuestions: Record<string, true>;
	/**
	 * Answers stored ahead of the windowed list, older than what paging has reached.
	 * Paging takes its cursor from the oldest stored answer, so it must skip these.
	 */
	sideLoadedIds: Record<string, true>;
}

interface AnswerViewsRootState {
	answerViews: AnswerViewsState;
}

interface RatingsRootState extends AnswerViewsRootState {
	evaluations: { userEvaluations: ReadonlyArray<{ statementId: string; evaluatorId: string }> };
	creator: { creator: { uid: string } | null };
}

const initialState: AnswerViewsState = {
	rateBatches: {},
	plainListQuestions: {},
	sideLoadedIds: {},
};

export const answerViewsSlice = createSlice({
	name: 'answerViews',
	initialState,
	reducers: {
		setRateBatch: (state, action: PayloadAction<{ questionId: string; entry: RateBatchEntry }>) => {
			state.rateBatches[action.payload.questionId] = action.payload.entry;
		},
		dropRatedFromBatch: (
			state,
			action: PayloadAction<{ questionId: string; ratedIds: readonly string[] }>,
		) => {
			const entry = state.rateBatches[action.payload.questionId];
			if (!entry) return;
			const rated = new Set(action.payload.ratedIds);
			entry.ids = entry.ids.filter((id) => !rated.has(id));
		},
		fallBackToPlainList: (state, action: PayloadAction<string>) => {
			state.plainListQuestions[action.payload] = true;
		},
		markSideLoaded: (state, action: PayloadAction<readonly string[]>) => {
			action.payload.forEach((id) => {
				state.sideLoadedIds[id] = true;
			});
		},
	},
});

export const { setRateBatch, dropRatedFromBatch, fallBackToPlainList, markSideLoaded } =
	answerViewsSlice.actions;

export const rateBatchSelector =
	(questionId: string | undefined) =>
	(state: AnswerViewsRootState): RateBatchEntry | undefined =>
		questionId ? state.answerViews.rateBatches[questionId] : undefined;

export const usesPlainListSelector =
	(questionId: string | undefined) =>
	(state: AnswerViewsRootState): boolean =>
		questionId ? state.answerViews.plainListQuestions[questionId] === true : false;

export const sideLoadedIdsSelector = (state: AnswerViewsRootState): Record<string, true> =>
	state.answerViews.sideLoadedIds;

/** "{n} more to rate": the rest of this batch, plus what the sampler has left to serve. */
export const moreToRateSelector =
	(questionId: string | undefined) =>
	(state: RatingsRootState): number => {
		const entry = rateBatchSelector(questionId)(state);
		if (!entry) return 0;
		const uid = state.creator.creator?.uid;
		const rated = new Set(
			state.evaluations.userEvaluations
				.filter((evaluation) => evaluation.evaluatorId === uid)
				.map((evaluation) => evaluation.statementId),
		);

		return entry.remaining + entry.ids.filter((id) => !rated.has(id)).length;
	};

export default answerViewsSlice.reducer;
