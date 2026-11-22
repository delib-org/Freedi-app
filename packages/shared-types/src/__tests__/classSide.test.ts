// valibot is mocked in this package's jest setup, so only the plain logic is tested here.
import {
	CLASS_SIDE_PRIVATE_FIELDS,
	classSideId,
	mergeClassSide,
	sidesLocked,
	sidesFrozen,
	shownSupport,
	CLASS_SIDE_MIN_SHOWN,
} from '../index';
import type { SupportBySide } from '../index';

describe('classSideId', () => {
	it('is the subscription id: {uid}--{mainId}', () => {
		expect(classSideId('main-1', 'u1')).toBe('u1--main-1');
	});
});

describe('mergeClassSide', () => {
	it('prefers the private doc field by field and fills gaps from the legacy subscription', () => {
		expect(mergeClassSide({ decisionSupport: 1 }, { side: 80, camp: 'b', decisionSupport: -1 })).toEqual({
			side: 80,
			camp: 'b',
			decisionSupport: 1,
		});
		expect(mergeClassSide({ side: 10, camp: 'a' }, { side: 80, camp: 'b' })).toEqual({
			side: 10,
			camp: 'a',
			decisionSupport: undefined,
		});
	});

	it('is empty when neither holds anything', () => {
		expect(mergeClassSide(undefined, undefined)).toEqual({
			side: undefined,
			camp: undefined,
			decisionSupport: undefined,
		});
	});
});

describe('CLASS_SIDE_PRIVATE_FIELDS', () => {
	it('names exactly the three private fields', () => {
		expect([...CLASS_SIDE_PRIVATE_FIELDS]).toEqual(['side', 'camp', 'decisionSupport']);
	});
});

describe('sidesLocked', () => {
	const steps = ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'proposals', 'vote', 'summary'];
	it('locks the sides at Vote and Summary only', () => {
		expect(steps.map((_, stepIndex) => sidesLocked({ steps, stepIndex }))).toEqual([
			false,
			false,
			false,
			false,
			false,
			false,
			true,
			true,
		]);
	});
	it('does not lock a lesson without a usable plan', () => {
		expect(sidesLocked(undefined)).toBe(false);
		expect(sidesLocked({ steps })).toBe(false);
		expect(sidesLocked({ steps, stepIndex: 99 })).toBe(false);
	});
});

describe('sidesFrozen', () => {
	const steps = ['side', 'tables', 'vote', 'summary'];
	it('freezes at Vote / Summary, and anywhere once locked', () => {
		expect(sidesFrozen({ steps, stepIndex: 0 }, null)).toBe(false);
		expect(sidesFrozen({ steps, stepIndex: 2 }, null)).toBe(true);
		expect(sidesFrozen({ steps, stepIndex: 0 }, { lockedAt: 5 })).toBe(true);
		expect(sidesFrozen(undefined, { lockedAt: 5 })).toBe(true);
	});
	it('keeps the totals on the current step only', () => {
		expect(sidesLocked({ steps, stepIndex: 0 })).toBe(false);
	});
});

describe('shownSupport (small sides hidden: no mean, no size)', () => {
	const camp = (m: number, n: number, mean: number) => ({ mean, n, m });
	const full = (
		a: [number, number],
		center: [number, number],
		b: [number, number],
		verdict: SupportBySide['verdict'] = 'closer',
	): SupportBySide => ({
		a: camp(a[0], a[1], 0.9),
		center: camp(center[0], center[1], -0.2),
		b: camp(b[0], b[1], 0.7),
		verdict,
	});

	it('hides every camp with 0, 1 or 2 members, whatever its raters, and sends only { hidden: true }', () => {
		for (const m of [0, 1, 2]) {
			for (let n = 0; n <= m; n++) {
				expect(shownSupport(full([m, n], [5, 5], [5, 5])).a).toEqual({ hidden: true });
			}
		}
		expect(CLASS_SIDE_MIN_SHOWN).toBe(3);
	});

	it('hides a camp of 3+ members that fewer than 3 rated; shows the mean from 3 raters', () => {
		for (const n of [0, 1, 2]) expect(shownSupport(full([5, n], [5, 5], [5, 5])).a).toEqual({ hidden: true });
		expect(shownSupport(full([3, 3], [4, 3], [5, 5])).a).toEqual({
			hidden: false,
			mean: 0.9,
			counts: { n: 3, m: 3 },
		});
	});

	it('sends counts only when every camp has 3+ members, and then only for shown camps', () => {
		const all = shownSupport(full([4, 3], [3, 1], [5, 5]));
		expect(all.a).toEqual({ hidden: false, mean: 0.9, counts: { n: 3, m: 4 } });
		expect(all.center).toEqual({ hidden: true });
		const small = shownSupport(full([4, 3], [1, 1], [5, 5]));
		expect(small.a).toEqual({ hidden: false, mean: 0.9, counts: null });
		expect(small.b).toEqual({ hidden: false, mean: 0.7, counts: null });
	});

	it('the subtraction case: with one camp under 3, the answer holds no count at all', () => {
		// The teacher knows how many chose a side (here 4 + small + 5). If any count
		// left the server, that total minus the others would give the small camp's size.
		for (const small of [0, 1, 2]) {
			const out = shownSupport(full([4, 3], [small, small], [5, 5]));
			const numbers = JSON.stringify(out).match(/-?\d+(\.\d+)?/g) ?? [];
			expect(numbers.sort()).toEqual(['0.7', '0.9']);
			expect(JSON.stringify(out)).not.toMatch(/"n"|"m"|"counts":\{/);
		}
	});

	it('never lets the verdict reveal a hidden pole camp, and sends no overall mean', () => {
		expect(shownSupport(full([2, 2], [5, 5], [5, 5], 'closer')).verdict).toBe('insufficient');
		expect(shownSupport(full([5, 5], [5, 5], [5, 1], 'apart')).verdict).toBe('insufficient');
		expect(shownSupport(full([5, 5], [1, 1], [5, 5], 'closer')).verdict).toBe('closer');
		expect(Object.keys(shownSupport(full([5, 5], [1, 1], [5, 5]))).sort()).toEqual([
			'a',
			'b',
			'center',
			'verdict',
		]);
	});
});
