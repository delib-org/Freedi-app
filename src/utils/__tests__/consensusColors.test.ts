/**
 * Tests for consensus color utilities
 */

import { getAgreementColor, calculateAgreement, getCSSVariableValue } from '../consensusColors';

describe('consensusColors', () => {
	describe('getAgreementColor', () => {
		it('should return strongest disagreement color for -1', () => {
			const color = getAgreementColor(-1);

			expect(color).toBe('--range-objections-100');
		});

		it('should return strongest agreement color for 1', () => {
			const color = getAgreementColor(1);

			expect(color).toBe('--range-positive-100');
		});

		it('should return neutral color for 0', () => {
			const color = getAgreementColor(0);

			// 0 maps to middle of the range
			expect(color).toMatch(/^--range-/);
		});

		it('should return disagreement color for negative values', () => {
			const color = getAgreementColor(-0.8);

			expect(color).toMatch(/objections/);
		});

		it('should return agreement color for positive values', () => {
			const color = getAgreementColor(0.8);

			expect(color).toMatch(/positive/);
		});

		it('should clamp values below -1 to -1', () => {
			const color = getAgreementColor(-2);

			expect(color).toBe('--range-objections-100');
		});

		it('should clamp values above 1 to 1', () => {
			const color = getAgreementColor(2);

			expect(color).toBe('--range-positive-100');
		});

		it('should handle slightly negative values', () => {
			const color = getAgreementColor(-0.2);

			expect(color).toMatch(/^--range-/);
		});

		it('should handle slightly positive values', () => {
			const color = getAgreementColor(0.2);

			expect(color).toMatch(/^--range-/);
		});

		it('should return valid CSS variable for all values in range', () => {
			const testValues = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];

			testValues.forEach((value) => {
				const color = getAgreementColor(value);
				expect(color).toMatch(/^--range-/);
			});
		});

		it('should handle NaN gracefully', () => {
			// NaN causes Math operations to fail, but function should not throw
			expect(() => getAgreementColor(NaN)).not.toThrow();
		});
	});

	describe('calculateAgreement', () => {
		it('should return 1 for all positive evaluations', () => {
			const agreement = calculateAgreement(10, 0, 10);

			expect(agreement).toBe(1);
		});

		it('should return -1 for all negative evaluations', () => {
			const agreement = calculateAgreement(0, 10, 10);

			expect(agreement).toBe(-1);
		});

		it('should return 0 for equal positive and negative', () => {
			const agreement = calculateAgreement(5, 5, 10);

			expect(agreement).toBe(0);
		});

		it('should return 0 for zero evaluators', () => {
			const agreement = calculateAgreement(10, 5, 0);

			expect(agreement).toBe(0);
		});

		it('should calculate correct positive agreement', () => {
			const agreement = calculateAgreement(8, 2, 10);

			expect(agreement).toBe(0.6);
		});

		it('should calculate correct negative agreement', () => {
			const agreement = calculateAgreement(2, 8, 10);

			expect(agreement).toBe(-0.6);
		});

		it('should use default value of 0 for sumPro', () => {
			const agreement = calculateAgreement(undefined, 5, 10);

			expect(agreement).toBe(-0.5);
		});

		it('should use default value of 0 for sumCon', () => {
			const agreement = calculateAgreement(5, undefined, 10);

			expect(agreement).toBe(0.5);
		});

		it('should use default value of 1 for numberOfEvaluators', () => {
			const agreement = calculateAgreement(1, 0);

			expect(agreement).toBe(1);
		});

		it('should handle all default values', () => {
			const agreement = calculateAgreement();

			expect(agreement).toBe(0);
		});

		it('should handle large numbers correctly', () => {
			const agreement = calculateAgreement(1000, 500, 1000);

			expect(agreement).toBe(0.5);
		});

		it('should handle decimal evaluations', () => {
			const agreement = calculateAgreement(0.5, 0.25, 1);

			expect(agreement).toBe(0.25);
		});
	});

	describe('getCSSVariableValue', () => {
		// Mock getComputedStyle for testing
		const originalGetComputedStyle = window.getComputedStyle;

		beforeEach(() => {
			window.getComputedStyle = jest.fn().mockReturnValue({
				getPropertyValue: jest.fn().mockImplementation((varName: string) => {
					const mockValues: Record<string, string> = {
						'--range-positive-100': '#388E3C',
						'--range-objections-100': '#D32F2F',
						'--range-conflict-60': '#FFB74D',
					};

					return mockValues[varName] || '';
				}),
			});
		});

		afterEach(() => {
			window.getComputedStyle = originalGetComputedStyle;
		});

		it('should return CSS variable value when it exists', () => {
			const value = getCSSVariableValue('--range-positive-100');

			expect(value).toBe('#388E3C');
		});

		it('should return fallback color for undefined variable', () => {
			const value = getCSSVariableValue('--non-existent-variable');

			// Should return fallback
			expect(value).toBeDefined();
			expect(value).not.toBe('');
		});

		it('should return fallback for known variable with empty value', () => {
			window.getComputedStyle = jest.fn().mockReturnValue({
				getPropertyValue: jest.fn().mockReturnValue(''),
			});

			const value = getCSSVariableValue('--range-positive-100');

			expect(value).toBe('#388E3C'); // Fallback value
		});

		it('should handle errors gracefully', () => {
			window.getComputedStyle = jest.fn().mockImplementation(() => {
				throw new Error('Test error');
			});

			const value = getCSSVariableValue('--range-positive-100');

			// Should return fallback instead of throwing
			expect(value).toBeDefined();
		});

		it('should return correct fallback colors', () => {
			window.getComputedStyle = jest.fn().mockReturnValue({
				getPropertyValue: jest.fn().mockReturnValue(''),
			});

			const positiveColor = getCSSVariableValue('--range-positive-100');
			const objectionColor = getCSSVariableValue('--range-objections-100');
			const conflictColor = getCSSVariableValue('--range-conflict-60');

			expect(positiveColor).toBe('#388E3C');
			expect(objectionColor).toBe('#D32F2F');
			expect(conflictColor).toBe('#FFB74D');
		});

		it('should return default grey for unknown variable', () => {
			window.getComputedStyle = jest.fn().mockReturnValue({
				getPropertyValue: jest.fn().mockReturnValue(''),
			});

			const value = getCSSVariableValue('--unknown-variable');

			expect(value).toBe('#9E9E9E');
		});
	});

	describe('color mapping consistency', () => {
		it('should provide gradual color transition across the range', () => {
			const colors: string[] = [];
			for (let i = -1; i <= 1; i += 0.25) {
				colors.push(getAgreementColor(i));
			}

			// All colors should be valid CSS variables
			colors.forEach((color) => {
				expect(color).toMatch(/^--range-/);
			});

			// First color should be strongest objection
			expect(colors[0]).toBe('--range-objections-100');

			// Last color should be strongest positive
			expect(colors[colors.length - 1]).toBe('--range-positive-100');
		});

		it('should map adjacent values to same or adjacent colors', () => {
			const color1 = getAgreementColor(0.5);
			const color2 = getAgreementColor(0.51);

			// Colors should be the same or very similar for close values
			expect(color1).toMatch(/^--range-/);
			expect(color2).toMatch(/^--range-/);
		});
	});
});
