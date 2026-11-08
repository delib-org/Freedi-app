import { describe, it, expect } from '@jest/globals';
import { EVALUATION_MAX, EVALUATION_MIN, clampEvaluationValue } from '../evaluationTypes';

describe('clampEvaluationValue', () => {
	it('leaves every value on the scale alone', () => {
		for (const value of [EVALUATION_MIN, -0.5, 0, 0.25, 0.5, 0.75, EVALUATION_MAX]) {
			expect(clampEvaluationValue(value)).toBe(value);
		}
	});

	it('pulls an out-of-range value back to the nearest bound', () => {
		expect(clampEvaluationValue(1000)).toBe(EVALUATION_MAX);
		expect(clampEvaluationValue(-1000)).toBe(EVALUATION_MIN);
	});

	it('counts anything that is not a finite number as 0', () => {
		for (const value of [NaN, Infinity, -Infinity, '1', null, undefined, {}]) {
			expect(clampEvaluationValue(value)).toBe(0);
		}
	});
});
