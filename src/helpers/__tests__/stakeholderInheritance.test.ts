import {
	isStakeholderCountInherited,
	resolveInheritedStakeholders,
} from '../stakeholderInheritance';

const scope = (parentId: string, targetPopulation?: number) => ({
	parentId,
	evaluationSettings: targetPopulation === undefined ? undefined : { targetPopulation },
});

describe('resolveInheritedStakeholders', () => {
	it('takes the group count when the parent declares none', () => {
		expect(resolveInheritedStakeholders(scope('q0'), scope('top', 1200))).toEqual({
			count: 1200,
			isFromGroup: true,
		});
	});

	it('reads a parent that is the group as from the group', () => {
		expect(resolveInheritedStakeholders(scope('top', 300), scope('top', 300))).toEqual({
			count: 300,
			isFromGroup: true,
		});
	});

	it('marks a parent question count as not from the group', () => {
		expect(resolveInheritedStakeholders(scope('g1', 40), scope('top', 1200))).toEqual({
			count: 40,
			isFromGroup: false,
		});
	});

	it('returns no count when nobody above declared one', () => {
		expect(resolveInheritedStakeholders(undefined, null)).toEqual({
			count: undefined,
			isFromGroup: false,
		});
	});
});

describe('isStakeholderCountInherited', () => {
	it('never inherits on a top-level space', () => {
		expect(isStakeholderCountInherited(scope('top'))).toBe(false);
	});

	it('inherits on a sub-space without a positive count', () => {
		expect(isStakeholderCountInherited(scope('g1'))).toBe(true);
		expect(isStakeholderCountInherited(scope('g1', 0))).toBe(true);
	});

	it('does not inherit once the sub-space declares a count', () => {
		expect(isStakeholderCountInherited(scope('g1', 50))).toBe(false);
	});
});
