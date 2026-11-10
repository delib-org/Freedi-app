import {
	isCounterMilestone,
	resolveMemberCount,
	resolveViewCount,
} from '../models/progress/questionCounters';

describe('isCounterMilestone', () => {
	it('copies every count while the group is small', () => {
		for (let count = 0; count <= 20; count += 1) {
			expect(isCounterMilestone(count)).toBe(true);
		}
	});

	it('copies at widening steps as the group grows', () => {
		expect(isCounterMilestone(21)).toBe(false);
		expect(isCounterMilestone(25)).toBe(true);
		expect(isCounterMilestone(101)).toBe(false);
		expect(isCounterMilestone(125)).toBe(true);
		expect(isCounterMilestone(1100)).toBe(true);
		expect(isCounterMilestone(1125)).toBe(false);
	});

	it('moves a 1,000-person question fewer than 100 times', () => {
		const milestones = Array.from({ length: 1000 }, (_, i) => i + 1).filter(isCounterMilestone);

		expect(milestones.length).toBeLessThan(100);
	});

	it('rejects values that are not a count', () => {
		expect(isCounterMilestone(-1)).toBe(false);
		expect(isCounterMilestone(1.5)).toBe(false);
	});
});

describe('resolveMemberCount', () => {
	it('prefers the exact number on the progress doc', () => {
		expect(resolveMemberCount({ members: 43 }, { numberOfMembers: 40 })).toBe(43);
	});

	it('uses the statement field for older questions', () => {
		expect(resolveMemberCount({}, { numberOfMembers: 40 })).toBe(40);
		expect(resolveMemberCount(null, { numberOfMembers: 40 })).toBe(40);
	});

	it('keeps a recount of zero rather than falling back', () => {
		expect(resolveMemberCount({ members: 0 }, { numberOfMembers: 40 })).toBe(0);
	});

	it('is undefined when neither is known', () => {
		expect(resolveMemberCount(null, undefined)).toBeUndefined();
	});
});

describe('resolveViewCount', () => {
	it('uses progress for new questions', () => {
		expect(resolveViewCount({ entered: 12 }, {})).toBe(12);
	});

	it('keeps views recorded before the progress doc existed', () => {
		expect(resolveViewCount({ entered: 3 }, { viewed: { individualViews: 50 } })).toBe(50);
		expect(resolveViewCount(null, { viewed: { individualViews: 50 } })).toBe(50);
	});

	it('is undefined when nothing was recorded', () => {
		expect(resolveViewCount({ entered: 0 }, {})).toBeUndefined();
		expect(resolveViewCount(null, undefined)).toBeUndefined();
	});
});
