import {
	resolveStakeholderCount,
	stakeholderCoverage,
	resolveSamplingQuality,
	type StakeholderScope,
} from '../utils/stakeholderPopulation';

const withPopulation = (targetPopulation: number): StakeholderScope => ({
	evaluationSettings: { targetPopulation },
});

const withMembers = (numberOfMembers: number): StakeholderScope => ({ numberOfMembers });

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

	describe('inferring from membership', () => {
		it('uses the group member count when nothing is declared', () => {
			expect(resolveStakeholderCount({}, {}, withMembers(42))).toEqual({
				count: 42,
				source: 'topMembers',
				inferred: true,
			});
		});

		it('prefers the broadest scope among inferred counts', () => {
			// The stakeholders of a question are the group holding it, not the
			// subset of people who happened to subscribe to that one question.
			expect(resolveStakeholderCount({}, withMembers(8), withMembers(42))).toEqual({
				count: 42,
				source: 'topMembers',
				inferred: true,
			});
		});

		it('lets a declaration anywhere beat an inferred count', () => {
			// "Who signed up" and "who this decision is about" are the same
			// number only by coincidence, so a human's answer always wins.
			expect(resolveStakeholderCount({}, withPopulation(500), withMembers(42))).toEqual({
				count: 500,
				source: 'parent',
				inferred: false,
			});
		});

		it('never infers from the statement being voted on', () => {
			// Self is typically the option. Its subscribers are not the
			// stakeholders of the decision it belongs to.
			expect(resolveStakeholderCount(withMembers(3), {}, {})).toEqual({ inferred: false });
		});
	});

	describe('rejecting counts that are not real headcounts', () => {
		it.each([0, -1, -500, NaN, Infinity, -Infinity])('rejects %p', (bad) => {
			expect(resolveStakeholderCount(withPopulation(bad))).toEqual({ inferred: false });
			expect(resolveStakeholderCount({}, {}, withMembers(bad))).toEqual({ inferred: false });
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
