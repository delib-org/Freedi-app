import type { Statement } from '@freedi/shared-types';
import { NONE_KEY } from '../constants';
import { jaccard, matchToExisting } from '../matchToExisting';
import { groupAssignments, reconcileWithCurrent, toPreviewThemes } from '../proposal';
import type { ThemeWithMembers } from '../types';

const oldTheme = (id: string, members: string[]): Statement =>
	({ statementId: id, integratedOptions: members }) as unknown as Statement;
const newTheme = (key: string, memberIds: string[]): ThemeWithMembers => ({
	key,
	name: `name ${key}`,
	rule: `rule ${key}`,
	memberIds,
});

describe('jaccard', () => {
	it('is shared over union', () => {
		expect(jaccard(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBe(0.5);
		expect(jaccard(new Set(), new Set())).toBe(0);
	});
});

describe('matchToExisting', () => {
	it('reuses the old doc at Jaccard ≥ 0.5 and hides the rest into the best-overlap theme', () => {
		const result = matchToExisting(
			[newTheme('t1', ['a', 'b', 'c']), newTheme('t2', ['d', 'e'])],
			[
				oldTheme('old1', ['a', 'b', 'c', 'x']), // 0.75 with t1 → reused
				oldTheme('old2', ['d', 'q', 'r', 's']), // 0.2 with t2 → hidden into t2
				oldTheme('old3', ['zz']), // overlaps nothing → hidden, no target
			],
		);

		expect(result.themes.map((t) => t.reusesThemeId)).toEqual(['old1', undefined]);
		expect(result.hidden).toEqual([{ themeId: 'old2', mergedIntoKey: 't2' }, { themeId: 'old3' }]);
	});

	it('does not reuse below 0.5', () => {
		const result = matchToExisting(
			[newTheme('t1', ['a', 'b', 'c'])],
			[oldTheme('old1', ['a', 'x', 'y'])],
		);

		expect(result.themes[0].reusesThemeId).toBeUndefined();
		expect(result.hidden).toEqual([{ themeId: 'old1', mergedIntoKey: 't1' }]);
	});

	it('reuses one-to-one, best pair first', () => {
		const result = matchToExisting(
			[newTheme('t1', ['a', 'b']), newTheme('t2', ['a', 'b', 'c'])],
			[oldTheme('old1', ['a', 'b', 'c'])],
		);

		// t2 is identical to old1 (1.0) and wins over t1 (0.67).
		expect(result.themes.map((t) => t.reusesThemeId)).toEqual([undefined, 'old1']);
		expect(result.hidden).toEqual([]);
	});
});

describe('groupAssignments', () => {
	it('puts each atom in exactly one theme or Other, and drops empty themes', () => {
		const grouped = groupAssignments(
			[
				{ key: 't1', name: 'A', rule: 'r' },
				{ key: 't2', name: 'B', rule: 'r' },
			],
			['x', 'y', 'z', 'w'],
			new Map([
				['x', 't1'],
				['y', NONE_KEY],
				['z', 't1'],
			]),
		);

		expect(grouped.themes).toEqual([{ key: 't1', name: 'A', rule: 'r', memberIds: ['x', 'z'] }]);
		expect(grouped.otherIds).toEqual(['y', 'w']);
	});
});

describe('reconcileWithCurrent', () => {
	it('sends late arrivals to Other and drops atoms that no longer exist', () => {
		const reconciled = reconcileWithCurrent(
			{
				atomIds: ['a', 'b', 'c', 'gone'],
				themes: [newTheme('t1', ['a', 'gone']), newTheme('t2', ['gone'])],
				otherIds: ['b', 'c'],
			},
			['a', 'b', 'c', 'late1', 'late2'],
		);

		expect(reconciled.themes).toEqual([newTheme('t1', ['a'])]);
		expect(reconciled.lateArrivals).toEqual(['late1', 'late2']);
		expect(reconciled.otherIds).toEqual(['b', 'c', 'late1', 'late2']);
	});
});

describe('toPreviewThemes', () => {
	it('returns counts, at most 3 sample titles and the reused id', () => {
		const [preview] = toPreviewThemes(
			[{ ...newTheme('t1', ['a', 'b', 'c', 'd']), reusesThemeId: 'old1' }],
			new Map([
				['a', 'A'],
				['b', 'B'],
				['c', 'C'],
				['d', 'D'],
			]),
		);

		expect(preview).toEqual({
			key: 't1',
			name: 'name t1',
			rule: 'rule t1',
			memberCount: 4,
			sampleTitles: ['A', 'B', 'C'],
			reusesThemeId: 'old1',
		});
	});
});
