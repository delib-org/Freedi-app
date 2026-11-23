// valibot is mocked in this package's jest setup, so only the plain logic is tested here.
import {
	CLASS_SIDE_PRIVATE_FIELDS,
	classSideId,
	mergeClassSide,
	sidesLocked,
	sidesFrozen,
	shownSupport,
	CLASS_SIDE_MIN_SHOWN,
	CLASS_SIDE_MIN_SHOWN_CAMPS,
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
	const ALL_HIDDEN = {
		a: { hidden: true },
		center: { hidden: true },
		b: { hidden: true },
		verdict: 'insufficient',
	};

	it('3 students, all in b: everything hidden', () => {
		expect(shownSupport(full([0, 0], [0, 0], [3, 3]))).toEqual(ALL_HIDDEN);
	});

	it('5 in b and 1 in a: everything hidden (one shown camp would place most choosers)', () => {
		expect(shownSupport(full([1, 1], [0, 0], [5, 5]))).toEqual(ALL_HIDDEN);
		expect(shownSupport(full([2, 2], [1, 1], [17, 17]))).toEqual(ALL_HIDDEN);
	});

	it('3 in a, 3 in b, nobody in the middle: a and b shown without counts, the middle hidden', () => {
		expect(shownSupport(full([3, 3], [0, 0], [3, 3]))).toEqual({
			a: { hidden: false, mean: 0.9, counts: null },
			center: { hidden: true },
			b: { hidden: false, mean: 0.7, counts: null },
			verdict: 'closer',
		});
	});

	it('3 / 3 / 3: all shown, with counts', () => {
		expect(shownSupport(full([3, 3], [3, 3], [3, 3]))).toEqual({
			a: { hidden: false, mean: 0.9, counts: { n: 3, m: 3 } },
			center: { hidden: false, mean: -0.2, counts: { n: 3, m: 3 } },
			b: { hidden: false, mean: 0.7, counts: { n: 3, m: 3 } },
			verdict: 'closer',
		});
		expect(CLASS_SIDE_MIN_SHOWN).toBe(3);
		expect(CLASS_SIDE_MIN_SHOWN_CAMPS).toBe(2);
	});

	it('two otherwise eligible camps but one rated by fewer than 3: only one passes, so everything hidden', () => {
		for (const n of [0, 1, 2]) expect(shownSupport(full([5, n], [0, 0], [5, 5]))).toEqual(ALL_HIDDEN);
	});

	it('hides every camp with 0, 1 or 2 members, whatever its raters, as { hidden: true } only', () => {
		for (const m of [0, 1, 2]) {
			for (let n = 0; n <= m; n++) {
				expect(shownSupport(full([m, n], [5, 5], [5, 5])).a).toEqual({ hidden: true });
			}
		}
	});

	it('counts only when every camp has 3+ members, and only for shown camps', () => {
		const all = shownSupport(full([4, 3], [3, 1], [5, 5]));
		expect(all.a).toEqual({ hidden: false, mean: 0.9, counts: { n: 3, m: 4 } });
		expect(all.center).toEqual({ hidden: true });
		const small = shownSupport(full([4, 3], [1, 1], [5, 5]));
		expect(small.a).toEqual({ hidden: false, mean: 0.9, counts: null });
		expect(small.b).toEqual({ hidden: false, mean: 0.7, counts: null });
	});

	it('the subtraction case: with one camp under 3, the answer holds no count at all', () => {
		// The teacher knows how many chose a side; with any count out, the total minus
		// the others would give the small camp's size.
		for (const small of [0, 1, 2]) {
			const out = shownSupport(full([4, 3], [small, small], [5, 5]));
			const numbers = JSON.stringify(out).match(/-?\d+(\.\d+)?/g) ?? [];
			expect(numbers.sort()).toEqual(['0.7', '0.9']);
			expect(JSON.stringify(out)).not.toMatch(/"n"|"m"|"counts":\{/);
		}
	});

	it('across every small class, a shown answer always has two shown camps, and never a size under 3', () => {
		for (let a = 0; a <= 6; a++) {
			for (let c = 0; c <= 6; c++) {
				for (let b = 0; b <= 6; b++) {
					const out = shownSupport(full([a, a], [c, c], [b, b]));
					const shown = [out.a, out.center, out.b].filter((x) => !x.hidden);
					expect(shown.length === 0 || shown.length >= 2).toBe(true);
					for (const x of [out.a, out.center, out.b]) {
						if (!x.hidden && x.counts) expect(x.counts.m).toBeGreaterThanOrEqual(3);
					}
					if ([a, c, b].some((m) => m < 3)) expect(JSON.stringify(out)).not.toMatch(/"counts":\{/);
				}
			}
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
