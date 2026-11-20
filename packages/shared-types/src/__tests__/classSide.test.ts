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

describe('shownSupport (small camps hidden)', () => {
	const camp = (n: number, mean = 0.5) => ({ mean, n, m: n + 1 });
	const full = (a: number, center: number, b: number, verdict: SupportBySide['verdict'] = 'closer'): SupportBySide => ({
		a: camp(a, 0.9),
		center: camp(center, -0.2),
		b: camp(b, 0.7),
		verdict,
	});

	it('hides the mean of camps rated by 0, 1 or 2 students and keeps it from 3', () => {
		const out = shownSupport(full(0, 1, 2));
		for (const c of [out.a, out.center, out.b]) {
			expect(c.hidden).toBe(true);
			expect(c).not.toHaveProperty('mean');
		}
		expect(out.a).toEqual({ hidden: true, n: 0, m: 1 });
		expect(shownSupport(full(3, 3, 3)).a).toEqual({ hidden: false, mean: 0.9, n: 3, m: 4 });
		expect(CLASS_SIDE_MIN_SHOWN).toBe(3);
	});

	it('never lets the verdict reveal a hidden pole camp', () => {
		expect(shownSupport(full(2, 5, 5, 'closer')).verdict).toBe('insufficient');
		expect(shownSupport(full(5, 5, 1, 'apart')).verdict).toBe('insufficient');
		expect(shownSupport(full(5, 1, 5, 'closer')).verdict).toBe('closer');
	});

	it('sends nothing the hidden mean could be subtracted from (no overall mean)', () => {
		const out = shownSupport(full(5, 1, 5));
		expect(Object.keys(out).sort()).toEqual(['a', 'b', 'center', 'verdict']);
		expect(JSON.stringify(out)).not.toContain('-0.2');
	});
});
