import {
	resolveStakeholderCount,
	stakeholderCoverage,
	resolveSamplingQuality,
	type StakeholderScope,
} from '../utils/stakeholderPopulation';

const withPopulation = (targetPopulation: number): StakeholderScope => ({
	evaluationSettings: { targetPopulation },
});

// chainEvaluators is a participation stat on real question docs. It is NOT part of
// StakeholderScope any more, so the cast is deliberate: these tests prove that
// real documents carrying it never leak into N.
const withVoters = (chainEvaluators: number): StakeholderScope =>
	({ evaluation: { chainEvaluators } }) as unknown as StakeholderScope;

describe('resolveStakeholderCount', () => {
	describe('when nothing is declared', () => {
		it('resolves to nothing rather than guessing', () => {
			// The safe default. No stakeholder set means open participation and
			// an unbounded population, which is exactly the case the original
			// uncorrected formula was built for.
			expect(resolveStakeholderCount()).toEqual({});
			expect(resolveStakeholderCount({}, {}, {})).toEqual({});
		});

		it('ignores an empty evaluationSettings object', () => {
			expect(resolveStakeholderCount({ evaluationSettings: {} })).toEqual({});
		});
	});

	describe('declaration order', () => {
		it('prefers the statement itself', () => {
			expect(
				resolveStakeholderCount(withPopulation(10), withPopulation(20), withPopulation(30)),
			).toEqual({ count: 10, source: 'self' });
		});

		it('falls back to the parent question', () => {
			expect(resolveStakeholderCount({}, withPopulation(20), withPopulation(30))).toEqual({
				count: 20,
				source: 'parent',
			});
		});

		it('falls back to the top-level group', () => {
			// The settlement case: declared once on the group, inherited by every
			// question and option beneath it.
			expect(resolveStakeholderCount({}, {}, withPopulation(500))).toEqual({
				count: 500,
				source: 'top',
			});
		});
	});

	describe('never inferring from who voted', () => {
		it("does not use the parent question's chain voter count", () => {
			expect(resolveStakeholderCount({}, withVoters(2), {}).count).toBeUndefined();
			expect(resolveStakeholderCount({}, withVoters(2), {})).toEqual({});
		});

		it("does not use the top's voters either", () => {
			expect(resolveStakeholderCount({}, withVoters(9), withVoters(4))).toEqual({});
			expect(resolveStakeholderCount({}, {}, withVoters(4)).source).toBeUndefined();
		});

		it('lets a declaration anywhere win over voter counts', () => {
			expect(resolveStakeholderCount({}, withVoters(2), withPopulation(500))).toEqual({
				count: 500,
				source: 'top',
			});
		});

		it('never infers from the statement being voted on', () => {
			expect(resolveStakeholderCount(withVoters(3), {}, {})).toEqual({});
		});

		it('ignores the subscriber count entirely', () => {
			// The whole point of the change: opening a page auto-subscribes you,
			// so members measure traffic. Fifteen subscribers and no votes is
			// no electorate at all.
			const subscribed = { numberOfMembers: 15 } as unknown as StakeholderScope;
			expect(resolveStakeholderCount({}, subscribed, subscribed)).toEqual({});
		});
	});

	describe('rejecting counts that are not real headcounts', () => {
		it.each([0, -1, -500, NaN, Infinity, -Infinity])('rejects %p', (bad) => {
			expect(resolveStakeholderCount(withPopulation(bad))).toEqual({});
			expect(resolveStakeholderCount({}, withVoters(bad), {})).toEqual({});
		});

		it('rejects a null left behind by clearing the settings field', () => {
			const cleared = {
				evaluationSettings: { targetPopulation: null as unknown as number },
			};
			expect(resolveStakeholderCount(cleared)).toEqual({});
		});

		it('keeps walking past an invalid declaration instead of stopping', () => {
			// A zeroed field on the question must not shadow the real count on
			// the group — otherwise clearing one input silently disables the
			// correction for everything beneath it.
			expect(resolveStakeholderCount({}, withPopulation(0), withPopulation(500))).toEqual({
				count: 500,
				source: 'top',
			});
		});
	});
});

describe('stakeholderCoverage', () => {
	it('is undefined without a stakeholder set', () => {
		// Without N there is no such thing as coverage, and saying "100%" or
		// "0%" would both be lies.
		expect(stakeholderCoverage(50)).toBeUndefined();
		expect(stakeholderCoverage(50, 0)).toBeUndefined();
		expect(stakeholderCoverage(50, NaN)).toBeUndefined();
	});

	it('reports the share of stakeholders who have spoken', () => {
		expect(stakeholderCoverage(50, 500)).toBe(0.1);
		expect(stakeholderCoverage(250, 500)).toBe(0.5);
		expect(stakeholderCoverage(500, 500)).toBe(1);
	});

	it('clamps an oversubscribed count to a full census', () => {
		expect(stakeholderCoverage(600, 500)).toBe(1);
	});

	it('handles nobody having spoken', () => {
		expect(stakeholderCoverage(0, 500)).toBe(0);
	});
});

describe('resolveSamplingQuality', () => {
	const withQuality = (samplingQuality: number): StakeholderScope => ({
		evaluationSettings: { samplingQuality },
	});

	it('is undefined when nobody declared one', () => {
		// The caller applies DEFAULT_SAMPLING_QUALITY; this function does not
		// pretend to know how participants were reached.
		expect(resolveSamplingQuality()).toBeUndefined();
		expect(resolveSamplingQuality({}, {}, {})).toBeUndefined();
	});

	it('walks self then parent then top', () => {
		expect(resolveSamplingQuality(withQuality(1), withQuality(0.7), withQuality(0.3))).toBe(1);
		expect(resolveSamplingQuality({}, withQuality(0.7), withQuality(0.3))).toBe(0.7);
		expect(resolveSamplingQuality({}, {}, withQuality(0.3))).toBe(0.3);
	});

	it('keeps walking past a non-positive or non-finite value', () => {
		expect(resolveSamplingQuality(withQuality(0), withQuality(0.7))).toBe(0.7);
		expect(resolveSamplingQuality(withQuality(NaN), withQuality(0.7))).toBe(0.7);
	});
});
