import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * What a large question's answer views have fetched, beyond the windowed list.
 * The statements themselves live in the statements slice; this holds which ones
 * make up a view. A batch on screen has its own listener; a page of top answers
 * has none and refreshes about once a minute, so no vote reaches everyone.
 */

/** The batch of answers this person is rating now. */
export interface RateBatchEntry {
	ids: string[];
	hasMore: boolean;
	/** Answers still to serve after this batch. */
	remaining: number;
}

/** A sampler call failed: when this view may try again, and how many times it has failed. */
export interface RateBatchFailure {
	failures: number;
	retryAt: number;
}

/** Where the next page of a ranked list starts. */
export interface RankedCursor {
	/** As stored: a document can hold null. */
	consensus: number | null;
	statementId: string;
}

/** The top answers of a question fetched so far, best first. */
export interface RankedPagesEntry {
	ids: string[];
	hasMore: boolean;
	cursor: RankedCursor | undefined;
}

export interface AnswerViewsState {
	rateBatches: Record<string, RateBatchEntry>;
	rankedPages: Record<string, RankedPagesEntry>;
	rateBatchFailures: Record<string, RateBatchFailure>;
	/** Questions the sampler found to have 30 answers or fewer: they keep the plain list. */
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
	rankedPages: {},
	rateBatchFailures: {},
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
		addRankedPage: (state, action: PayloadAction<RankedPagesEntry & { questionId: string }>) => {
			const { questionId, ids, hasMore, cursor } = action.payload;
			const previous = state.rankedPages[questionId];
			const known = previous?.ids ?? [];
			// A page that did not move the cursor would repeat for ever.
			const progressed =
				!previous ||
				previous.cursor?.statementId !== cursor?.statementId ||
				previous.cursor?.consensus !== cursor?.consensus;
			state.rankedPages[questionId] = {
				ids: [...known, ...ids.filter((id) => !known.includes(id))],
				hasMore: hasMore && progressed,
				cursor,
			};
		},
		mergeRankedTop: (
			state,
			action: PayloadAction<{ questionId: string; ids: readonly string[] }>,
		) => {
			const entry = state.rankedPages[action.payload.questionId];
			if (!entry) return;
			const known = new Set(entry.ids);
			entry.ids.push(...action.payload.ids.filter((id) => !known.has(id)));
		},
		recordRateBatchFailure: (
			state,
			action: PayloadAction<RateBatchFailure & { questionId: string }>,
		) => {
			const { questionId, failures, retryAt } = action.payload;
			state.rateBatchFailures[questionId] = { failures, retryAt };
		},
		clearRateBatchFailure: (state, action: PayloadAction<string>) => {
			delete state.rateBatchFailures[action.payload];
		},
		markSideLoaded: (state, action: PayloadAction<readonly string[]>) => {
			action.payload.forEach((id) => {
				state.sideLoadedIds[id] = true;
			});
		},
	},
});

export const {
	setRateBatch,
	dropRatedFromBatch,
	fallBackToPlainList,
	addRankedPage,
	mergeRankedTop,
	recordRateBatchFailure,
	clearRateBatchFailure,
	markSideLoaded,
} = answerViewsSlice.actions;

export const rateBatchSelector =
	(questionId: string | undefined) =>
	(state: AnswerViewsRootState): RateBatchEntry | undefined =>
		questionId ? state.answerViews.rateBatches[questionId] : undefined;

export const rankedPagesSelector =
	(questionId: string | undefined) =>
	(state: AnswerViewsRootState): RankedPagesEntry | undefined =>
		questionId ? state.answerViews.rankedPages[questionId] : undefined;

export const rateBatchFailureSelector =
	(questionId: string | undefined) =>
	(state: AnswerViewsRootState): RateBatchFailure | undefined =>
		questionId ? state.answerViews.rateBatchFailures[questionId] : undefined;

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
