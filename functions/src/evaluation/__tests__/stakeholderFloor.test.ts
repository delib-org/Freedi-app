import { resolveStakeholderCount, type StakeholderScope } from '@freedi/shared-types';
import { floorStakeholderCount } from '../stakeholderFloor';

describe('floorStakeholderCount', () => {
	it('is undefined when nothing is declared, even if people voted', () => {
		expect(floorStakeholderCount(undefined, 55)).toBeUndefined();
	});

	it('keeps a declared N that is larger than the evaluators', () => {
		expect(floorStakeholderCount(500, 55)).toBe(500);
	});

	it('floors a declared N at the evaluator count', () => {
		expect(floorStakeholderCount(40, 55)).toBe(55);
	});

	it('chained with resolveStakeholderCount: voters on the question never become N', () => {
		const question = { evaluation: { chainEvaluators: 119 } } as unknown as StakeholderScope;
		const { count } = resolveStakeholderCount(undefined, question, question);

		expect(floorStakeholderCount(count, 5)).toBeUndefined();
	});

	it('chained with resolveStakeholderCount: the N declared on the group wins', () => {
		const top: StakeholderScope = { evaluationSettings: { targetPopulation: 300 } };
		const { count } = resolveStakeholderCount(undefined, {}, top);

		expect(floorStakeholderCount(count, 5)).toBe(300);
	});
});
