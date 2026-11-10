import { CutoffBy, ResultsSettings, SortType, Statement } from '@freedi/shared-types';
import { guardScoreSort } from '../../components/questionScreen/canSeeScore';
import { RANKED_ANSWERS } from '@/constants/common';
import {
	rankingSourceForList,
	rankingSourceForSort,
	resultsNeedCompleteSet,
} from '../answerRanking';

const SINGLE_LIKE = {
	statementSettings: { evaluationType: 'single-like' },
} as unknown as Statement;

function settings(overrides: Partial<ResultsSettings>): ResultsSettings {
	return { cutoffBy: CutoffBy.topOptions, numberOfResults: 1, ...overrides } as ResultsSettings;
}

describe('rankingSourceForSort', () => {
	it('pages the top answers for the agreement order', () => {
		expect(rankingSourceForSort(SortType.accepted, undefined)).toBe('top-answers');
	});

	it('needs every answer on a single-like question, which ranks by likes', () => {
		expect(rankingSourceForSort(SortType.accepted, SINGLE_LIKE)).toBe('complete-set');
	});

	it.each([SortType.averageEvaluation, SortType.mostJoined, SortType.mostUpdated])(
		'needs every answer for %s, which no index ranks',
		(sort) => {
			expect(rankingSourceForSort(sort, undefined)).toBe('complete-set');
		},
	);

	it.each([SortType.newest, SortType.random, undefined])('uses the window for %s', (sort) => {
		expect(rankingSourceForSort(sort, undefined)).toBe('window');
	});

	it('never ranks by score for someone the guard stops, results off included', () => {
		expect(rankingSourceForSort(guardScoreSort(SortType.accepted, false), undefined)).toBe(
			'window',
		);
	});
});

describe('rankingSourceForList', () => {
	it('loads every answer under a hand-placed order, rather than the top page', () => {
		expect(rankingSourceForList(SortType.accepted, undefined, true)).toBe('complete-set');
	});

	it('pages the top answers with no hand-placed order', () => {
		expect(rankingSourceForList(SortType.accepted, undefined, false)).toBe('top-answers');
	});

	it('leaves other orderings alone', () => {
		expect(rankingSourceForList(SortType.newest, undefined, true)).toBe('window');
	});
});

describe('resultsNeedCompleteSet', () => {
	it('settles top N from the first page', () => {
		expect(resultsNeedCompleteSet(settings({ numberOfResults: 3 }), undefined)).toBe(false);
	});

	it('needs every answer for a threshold count', () => {
		expect(resultsNeedCompleteSet(settings({ cutoffBy: CutoffBy.aboveThreshold }), undefined)).toBe(
			true,
		);
	});

	it('needs every answer for "all rated"', () => {
		expect(resultsNeedCompleteSet(settings({ cutoffBy: CutoffBy.all }), undefined)).toBe(true);
	});

	it('needs every answer when N is bigger than a page', () => {
		expect(
			resultsNeedCompleteSet(
				settings({ numberOfResults: RANKED_ANSWERS.PAGE_SIZE + 1 }),
				undefined,
			),
		).toBe(true);
	});

	it('needs every answer on a single-like question', () => {
		expect(resultsNeedCompleteSet(settings({}), SINGLE_LIKE)).toBe(true);
	});
});
