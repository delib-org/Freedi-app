import {
	resolveStakeholderCount,
	stakeholderCoverage,
	resolveSamplingQuality,
	type StakeholderScope,
} from '../utils/stakeholderPopulation';

const withPopulation = (targetPopulation: number): StakeholderScope => ({
	evaluationSettings: { targetPopulation },
});

const withVoters = (chainEvaluators: number): StakeholderScope => ({
	evaluation: { chainEvaluators },
});

describe('resolveStakeholderCount', () => {
	describe('when nothing is declared', () => {
		it('resolves to nothing rather than guessing', () => {
			// The safe default. No stakeholder set means open participation and
			// an unbounded population, which is exactly the case the original
			// uncorrected formula was built for.
			expect(resolveStakeholderCount()).toEqual({ inferred: false });
			expect(resolveStakeholderCount({}, {}, {})).toEqual({ inferred: false });
		});

		it('ignores an empty evaluationSettings object', () => {
			expect(resolveStakeholderCount({ evaluationSettings: {} })).toEqual({ inferred: false });
		});
	});

	describe('declaration order', () => {
		it('prefers the statement itself', () => {
			expect(
				resolveStakeholderCount(withPopulation(10), withPopulation(20), withPopulation(30)),
			).toEqual({ count: 10, source: 'self', inferred: false });
		});

		it('falls back to the parent question', () => {
			expect(resolveStakeholderCount({}, withPopulation(20), withPopulation(30))).toEqual({
				count: 20,
				source: 'parent',
				inferred: false,
			});
		});

		it('falls back to the top-level group', () => {
			// The settlement case: declared once on the group, inherited by every
			// question and option beneath it.
			expect(resolveStakeholderCount({}, {}, withPopulation(500))).toEqual({
				count: 500,
				source: 'top',
				inferred: false,
			});
		});
	});

	describe('inferring from who voted', () => {
		it("uses the parent question's chain voter count when nothing is declared", () => {
			expect(resolveStakeholderCount({}, withVoters(2), {})).toEqual({
				count: 2,
				source: 'parentVoters',
				inferred: true,
			});
		});

		it('prefers the question the option actually sits under', () => {
			// chainEvaluators at the parent ALREADY contains the top's voters —
			// that is what makes it a chain count — so the nearer number is the
			// complete one, not the narrower one.
			expect(resolveStakeholderCount({}, withVoters(9), withVoters(4))).toEqual({
				count: 9,
				source: 'parentVoters',
				inferred: true,
			});
		});

		it("falls back to the top's voters before giving up", () => {
			// The window before a question's own count has ever been written.
			expect(resolveStakeholderCount({}, {}, withVoters(4))).toEqual({
				count: 4,
				source: 'topVoters',
				inferred: true,
			});
		});

		it('lets a declaration anywhere beat an inferred count', () => {
			// "Who showed up" and "who this decision is about" are the same
			// number only by coincidence, so a human's answer always wins.
			expect(resolveStakeholderCount({}, withVoters(2), withPopulation(500))).toEqual({
				count: 500,
				source: 'top',
				inferred: false,
			});
		});

		it('never infers from the statement being voted on', () => {
			// Self is typically the option, and chainEvaluators is a
			// question-level fact. An option carrying one is stale data from
			// when it was a question, not an electorate.
			expect(resolveStakeholderCount(withVoters(3), {}, {})).toEqual({ inferred: false });
		});

		it('ignores the subscriber count entirely', () => {
			// The whole point of the change: opening a page auto-subscribes you,
			// so members measure traffic. Fifteen subscribers and no votes is
			// no electorate at all.
			const subscribed = { numberOfMembers: 15 } as unknown as StakeholderScope;
			expect(resolveStakeholderCount({}, subscribed, subscribed)).toEqual({ inferred: false });
		});
	});

	describe('rejecting counts that are not real headcounts', () => {
		it.each([0, -1, -500, NaN, Infinity, -Infinity])('rejects %p', (bad) => {
			expect(resolveStakeholderCount(withPopulation(bad))).toEqual({ inferred: false });
			expect(resolveStakeholderCount({}, withVoters(bad), {})).toEqual({ inferred: false });
		});

		it('rejects a null left behind by clearing the settings field', () => {
			const cleared = {
				evaluationSettings: { targetPopulation: null as unknown as number },
			};
			expect(resolveStakeholderCount(cleared)).toEqual({ inferred: false });
		});

		it('keeps walking past an invalid declaration instead of stopping', () => {
			// A zeroed field on the question must not shadow the real count on
			// the group — otherwise clearing one input silently disables the
			// correction for everything beneath it.
			expect(resolveStakeholderCount({}, withPopulation(0), withPopulation(500))).toEqual({
				count: 500,
				source: 'top',
				inferred: false,
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
