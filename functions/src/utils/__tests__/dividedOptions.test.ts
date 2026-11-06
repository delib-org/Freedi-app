import { Statement } from '@freedi/shared-types';
import { isDividedOption, filterDividedOptions } from '../dividedOptions';

function option(total: number, pro?: number, con?: number): Statement {
	return {
		statementId: 's',
		evaluation: {
			numberOfEvaluators: total,
			numberOfProEvaluators: pro,
			numberOfConEvaluators: con,
		},
	} as unknown as Statement;
}

describe('isDividedOption', () => {
	it('is divided when 5+ evaluators and both sides above 30%', () => {
		expect(isDividedOption(option(10, 4, 4))).toBe(true);
	});

	it('needs at least 5 evaluators', () => {
		expect(isDividedOption(option(4, 2, 2))).toBe(false);
		expect(isDividedOption(option(5, 2, 2))).toBe(true);
	});

	it('requires strictly more than 30% on each side', () => {
		expect(isDividedOption(option(10, 3, 5))).toBe(false);
		expect(isDividedOption(option(10, 5, 3))).toBe(false);
		expect(isDividedOption(option(10, 4, 3))).toBe(false);
	});

	it('is not divided when one side dominates', () => {
		expect(isDividedOption(option(10, 9, 1))).toBe(false);
	});

	it('handles missing counts and missing evaluation', () => {
		expect(isDividedOption(option(10))).toBe(false);
		expect(isDividedOption({ statementId: 'x' } as Statement)).toBe(false);
	});
});

describe('filterDividedOptions', () => {
	it('keeps only divided options', () => {
		const divided = option(10, 4, 4);
		expect(filterDividedOptions([divided, option(10, 9, 1)])).toEqual([divided]);
	});
});
