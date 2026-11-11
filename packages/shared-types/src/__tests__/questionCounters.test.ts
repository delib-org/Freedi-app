import {
	isCounterCopyDue,
	resolveMemberCount,
	resolveViewCount,
} from '../models/progress/questionCounters';

describe('isCounterCopyDue', () => {
	it('copies every change while the group is small', () => {
		for (let count = 1; count <= 20; count += 1) {
			expect(isCounterCopyDue(count, count - 1)).toBe(true);
		}
	});

	it('leaves the copy alone inside a bucket', () => {
		expect(isCounterCopyDue(24, 20)).toBe(false);
		expect(isCounterCopyDue(124, 100)).toBe(false);
		expect(isCounterCopyDue(1099, 1000)).toBe(false);
	});

	it('copies when a new bucket is entered', () => {
		expect(isCounterCopyDue(25, 20)).toBe(true);
		expect(isCounterCopyDue(125, 100)).toBe(true);
		expect(isCounterCopyDue(1100, 1000)).toBe(true);
	});

	it('still copies when a burst jumps over the exact milestone', () => {
		expect(isCounterCopyDue(26, 24)).toBe(true);
		expect(isCounterCopyDue(127, 120)).toBe(true);
	});

	it('copies when the count falls into a lower bucket', () => {
		expect(isCounterCopyDue(24, 25)).toBe(true);
	});

	it('copies when there is no stored value yet', () => {
		expect(isCounterCopyDue(1500, undefined)).toBe(true);
	});

	it('moves a 1,000-person question fewer than 100 times', () => {
		let copies = 0;
		let stored: number | undefined;
		for (let count = 1; count <= 1000; count += 1) {
			if (isCounterCopyDue(count, stored)) {
				copies += 1;
				stored = count;
			}
		}

		expect(copies).toBeLessThan(100);
	});

	it('rejects values that are not a count', () => {
		expect(isCounterCopyDue(-1, 0)).toBe(false);
		expect(isCounterCopyDue(1.5, 0)).toBe(false);
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
