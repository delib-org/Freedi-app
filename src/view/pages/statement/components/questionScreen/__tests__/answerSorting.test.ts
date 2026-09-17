import { SortType } from '@freedi/shared-types';
import {
	buildAnswerSortPath,
	getAnswerSortOptions,
	hasEnoughAnswersToSort,
	resolveCurrentSort,
	sortRouteBase,
} from '../answerSorting';

describe('answerSorting', () => {
	describe('getAnswerSortOptions', () => {
		it('offers newest, most updated, random and agreement by default', () => {
			const ids = getAnswerSortOptions({ showEvaluation: true, joiningEnabled: false }).map(
				(o) => o.id,
			);
			expect(ids).toEqual([
				SortType.newest,
				SortType.mostUpdated,
				SortType.random,
				SortType.accepted,
			]);
		});

		it('drops agreement when ratings are not shown', () => {
			const ids = getAnswerSortOptions({ showEvaluation: false, joiningEnabled: false }).map(
				(o) => o.id,
			);
			expect(ids).not.toContain(SortType.accepted);
			expect(ids).toContain(SortType.newest);
		});

		it('swaps most updated for most joined when joining is enabled', () => {
			const ids = getAnswerSortOptions({ showEvaluation: true, joiningEnabled: true }).map(
				(o) => o.id,
			);
			expect(ids).toContain(SortType.mostJoined);
			expect(ids).not.toContain(SortType.mostUpdated);
		});

		it('gives every option a translation key', () => {
			for (const option of getAnswerSortOptions({ showEvaluation: true, joiningEnabled: true })) {
				expect(option.labelKey.length).toBeGreaterThan(0);
			}
		});
	});

	describe('hasEnoughAnswersToSort', () => {
		it('needs two answers or two children', () => {
			expect(hasEnoughAnswersToSort(1, 1)).toBe(false);
			expect(hasEnoughAnswersToSort(2, 0)).toBe(true);
			expect(hasEnoughAnswersToSort(0, 2)).toBe(true);
		});
	});

	describe('resolveCurrentSort', () => {
		it('prefers the route param', () => {
			expect(
				resolveCurrentSort({
					paramSort: SortType.random,
					defaultSort: SortType.accepted,
					hasManualOrder: true,
				}),
			).toEqual({ kind: 'sort', sort: SortType.random });
		});

		it('ignores an unknown route param', () => {
			expect(
				resolveCurrentSort({ paramSort: 'bogus', defaultSort: undefined, hasManualOrder: false }),
			).toEqual({ kind: 'sort', sort: SortType.newest });
		});

		it('reports the host order when one is set and no param is given', () => {
			expect(
				resolveCurrentSort({
					paramSort: undefined,
					defaultSort: SortType.newest,
					hasManualOrder: true,
				}),
			).toEqual({ kind: 'manual' });
		});

		it('falls back to the question default, then newest', () => {
			expect(
				resolveCurrentSort({
					paramSort: undefined,
					defaultSort: SortType.accepted,
					hasManualOrder: false,
				}),
			).toEqual({ kind: 'sort', sort: SortType.accepted });
			expect(
				resolveCurrentSort({ paramSort: undefined, defaultSort: undefined, hasManualOrder: false }),
			).toEqual({ kind: 'sort', sort: SortType.newest });
		});
	});

	describe('sortRouteBase', () => {
		it('keeps the stage family and defaults to statement', () => {
			expect(sortRouteBase('/stage/abc/newest')).toBe('stage');
			expect(sortRouteBase('/statement/abc')).toBe('statement');
			expect(sortRouteBase('/statement-screen/abc/settings')).toBe('statement');
		});
	});

	describe('buildAnswerSortPath', () => {
		it('keeps the tab and adds a seed for random', () => {
			expect(
				buildAnswerSortPath({
					pathname: '/statement/abc',
					statementId: 'abc',
					sort: SortType.random,
					tab: 'options',
					now: 42,
				}),
			).toBe('/statement/abc/random?tab=options&t=42');
		});

		it('omits the query when there is nothing to carry', () => {
			expect(
				buildAnswerSortPath({
					pathname: '/stage/abc',
					statementId: 'abc',
					sort: SortType.newest,
					tab: null,
				}),
			).toBe('/stage/abc/newest');
		});
	});
});
