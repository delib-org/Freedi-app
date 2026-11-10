import reducer, {
	addRankedPage,
	AnswerViewsState,
	clearRateBatchFailure,
	dropRatedFromBatch,
	fallBackToPlainList,
	markSideLoaded,
	mergeRankedTop,
	moreToRateSelector,
	rankedPagesSelector,
	rateBatchFailureSelector,
	rateBatchSelector,
	recordRateBatchFailure,
	setRateBatch,
	sideLoadedIdsSelector,
	usesPlainListSelector,
} from '../answerViewsSlice';

const Q = 'q';
const empty = reducer(undefined, { type: 'init' });
const cursor = (statementId: string, consensus: number | null = 0.5) => ({
	consensus,
	statementId,
});
const rootOf = (answerViews: AnswerViewsState) => ({ answerViews });

describe('rate batches', () => {
	const withBatch = reducer(
		empty,
		setRateBatch({ questionId: Q, entry: { ids: ['a', 'b'], hasMore: true, remaining: 4 } }),
	);

	it('stores a batch per question', () => {
		expect(rateBatchSelector(Q)(rootOf(withBatch))?.ids).toEqual(['a', 'b']);
		expect(rateBatchSelector('other')(rootOf(withBatch))).toBeUndefined();
		expect(rateBatchSelector(undefined)(rootOf(withBatch))).toBeUndefined();
	});

	it('drops rated answers', () => {
		const next = reducer(withBatch, dropRatedFromBatch({ questionId: Q, ratedIds: ['a'] }));

		expect(next.rateBatches[Q].ids).toEqual(['b']);
	});

	it('ignores dropping from a question with no batch', () => {
		expect(reducer(empty, dropRatedFromBatch({ questionId: Q, ratedIds: ['a'] }))).toEqual(empty);
	});

	it('counts what is left: the unrated on screen plus what the sampler still has', () => {
		const state = {
			answerViews: withBatch,
			evaluations: {
				userEvaluations: [
					{ statementId: 'a', evaluatorId: 'me' },
					{ statementId: 'b', evaluatorId: 'someone-else' },
				],
			},
			creator: { creator: { uid: 'me' } },
		};

		expect(moreToRateSelector(Q)(state)).toBe(5);
		expect(moreToRateSelector('other')(state)).toBe(0);
	});
});

describe('falling back', () => {
	it('keeps a small question on the plain list', () => {
		const next = reducer(empty, fallBackToPlainList(Q));

		expect(usesPlainListSelector(Q)(rootOf(next))).toBe(true);
		expect(usesPlainListSelector('other')(rootOf(next))).toBe(false);
		expect(usesPlainListSelector(undefined)(rootOf(next))).toBe(false);
	});

	it('records a failure and clears it after a success', () => {
		const failed = reducer(
			empty,
			recordRateBatchFailure({ questionId: Q, failures: 2, retryAt: 900 }),
		);

		expect(rateBatchFailureSelector(Q)(rootOf(failed))).toEqual({ failures: 2, retryAt: 900 });
		expect(rateBatchFailureSelector(undefined)(rootOf(failed))).toBeUndefined();
		expect(
			rateBatchFailureSelector(Q)(rootOf(reducer(failed, clearRateBatchFailure(Q)))),
		).toBeUndefined();
	});
});

describe('ranked pages', () => {
	const first = reducer(
		empty,
		addRankedPage({ questionId: Q, ids: ['a', 'b'], hasMore: true, cursor: cursor('b') }),
	);

	it('appends a page without repeating an id', () => {
		const next = reducer(
			first,
			addRankedPage({ questionId: Q, ids: ['b', 'c'], hasMore: true, cursor: cursor('c', 0.2) }),
		);

		expect(rankedPagesSelector(Q)(rootOf(next))?.ids).toEqual(['a', 'b', 'c']);
		expect(next.rankedPages[Q].hasMore).toBe(true);
	});

	it('stops offering more when a page did not move the cursor', () => {
		const next = reducer(
			first,
			addRankedPage({ questionId: Q, ids: ['b'], hasMore: true, cursor: cursor('b') }),
		);

		expect(next.rankedPages[Q].hasMore).toBe(false);
	});

	it('takes a first page even when it has no cursor', () => {
		const next = reducer(
			empty,
			addRankedPage({ questionId: Q, ids: [], hasMore: false, cursor: undefined }),
		);

		expect(next.rankedPages[Q]).toEqual({ ids: [], hasMore: false, cursor: undefined });
	});

	it('adds new answers from a refresh and leaves the cursor', () => {
		const next = reducer(first, mergeRankedTop({ questionId: Q, ids: ['new', 'a'] }));

		expect(next.rankedPages[Q].ids).toEqual(['a', 'b', 'new']);
		expect(next.rankedPages[Q].cursor).toEqual(cursor('b'));
	});

	it('ignores a refresh for a question with no pages', () => {
		expect(reducer(empty, mergeRankedTop({ questionId: Q, ids: ['a'] }))).toEqual(empty);
	});

	it('returns nothing for no question', () => {
		expect(rankedPagesSelector(undefined)(rootOf(first))).toBeUndefined();
	});
});

describe('side-loaded answers', () => {
	it('remembers the ids', () => {
		const next = reducer(empty, markSideLoaded(['a', 'b']));

		expect(sideLoadedIdsSelector(rootOf(next))).toEqual({ a: true, b: true });
	});
});
