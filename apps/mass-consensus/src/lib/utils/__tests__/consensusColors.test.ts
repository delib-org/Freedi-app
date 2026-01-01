/**
 * Tests for consensusColors utility functions
 */
import {
  getAgreementColor,
  calculateAgreement,
  getFallbackColor,
} from '../consensusColors';

describe('consensusColors', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getAgreementColor', () => {
    describe('agreement range mapping', () => {
      it('should return strong disagreement color for -1', () => {
        const color = getAgreementColor(-1);
        expect(color).toBe('--range-objections-100');
      });

      it('should return strong agreement color for 1', () => {
        const color = getAgreementColor(1);
        expect(color).toBe('--range-positive-100');
      });

      it('should return neutral/conflict color for 0', () => {
        const color = getAgreementColor(0);
        // 0 maps to middle of range (conflict area)
        expect(color).toMatch(/--range-conflict/);
      });

      it('should return objections color for negative values', () => {
        const color = getAgreementColor(-0.8);
        expect(color).toMatch(/--range-objections/);
      });

      it('should return positive color for positive values', () => {
        const color = getAgreementColor(0.8);
        expect(color).toMatch(/--range-positive/);
      });
    });

    describe('clamping behavior', () => {
      it('should clamp values below -1 to -1', () => {
        const color = getAgreementColor(-5);
        expect(color).toBe('--range-objections-100');
      });

      it('should clamp values above 1 to 1', () => {
        const color = getAgreementColor(5);
        expect(color).toBe('--range-positive-100');
      });

      it('should handle extreme negative values', () => {
        const color = getAgreementColor(-100);
        expect(color).toBe('--range-objections-100');
      });

      it('should handle extreme positive values', () => {
        const color = getAgreementColor(100);
        expect(color).toBe('--range-positive-100');
      });
    });

    describe('edge cases', () => {
      it('should handle NaN gracefully', () => {
        // NaN propagates through math operations and results in undefined array access
        // This is a known edge case - the function should ideally handle it better
        // but we document the current behavior
        const color = getAgreementColor(NaN);
        // NaN causes Math.floor(NaN) = NaN, which returns undefined from array
        expect(color).toBeUndefined();
      });

      it('should handle Infinity', () => {
        const color = getAgreementColor(Infinity);
        expect(color).toBe('--range-positive-100');
      });

      it('should handle -Infinity', () => {
        const color = getAgreementColor(-Infinity);
        expect(color).toBe('--range-objections-100');
      });

      it('should handle very small positive values', () => {
        const color = getAgreementColor(0.001);
        expect(color).toBeTruthy();
      });

      it('should handle very small negative values', () => {
        const color = getAgreementColor(-0.001);
        expect(color).toBeTruthy();
      });
    });

    describe('color progression', () => {
      it('should return progressively more positive colors as agreement increases', () => {
        const colors = [-1, -0.5, 0, 0.5, 1].map(getAgreementColor);

        // First should be objections
        expect(colors[0]).toMatch(/--range-objections/);
        // Last should be positive
        expect(colors[4]).toMatch(/--range-positive/);
        // All should be valid CSS variable names
        colors.forEach(color => {
          expect(color).toMatch(/^--range-/);
        });
      });

      it('should have distinct colors for different agreement levels', () => {
        const colorNeg = getAgreementColor(-0.9);
        const colorPos = getAgreementColor(0.9);
        expect(colorNeg).not.toBe(colorPos);
      });
    });
  });

  describe('calculateAgreement', () => {
    describe('basic calculations', () => {
      it('should return 0 when sumPro equals sumCon', () => {
        const agreement = calculateAgreement(5, 5, 10);
        expect(agreement).toBe(0);
      });

      it('should return positive value when sumPro > sumCon', () => {
        const agreement = calculateAgreement(10, 2, 10);
        expect(agreement).toBeGreaterThan(0);
      });

      it('should return negative value when sumCon > sumPro', () => {
        const agreement = calculateAgreement(2, 10, 10);
        expect(agreement).toBeLessThan(0);
      });

      it('should calculate correct agreement score', () => {
        // (10 - 5) / 10 = 0.5
        const agreement = calculateAgreement(10, 5, 10);
        expect(agreement).toBe(0.5);
      });

      it('should handle negative agreement correctly', () => {
        // (5 - 10) / 10 = -0.5
        const agreement = calculateAgreement(5, 10, 10);
        expect(agreement).toBe(-0.5);
      });
    });

    describe('edge cases', () => {
      it('should return 0 when numberOfEvaluators is 0', () => {
        const agreement = calculateAgreement(10, 5, 0);
        expect(agreement).toBe(0);
      });

      it('should use default value 1 for numberOfEvaluators when undefined', () => {
        const agreement = calculateAgreement(10, 5);
        expect(agreement).toBe(5); // (10 - 5) / 1 = 5
      });

      it('should use default value 0 for sumPro when undefined', () => {
        const agreement = calculateAgreement(undefined as unknown as number, 5, 10);
        expect(agreement).toBe(-0.5); // (0 - 5) / 10 = -0.5
      });

      it('should use default value 0 for sumCon when undefined', () => {
        const agreement = calculateAgreement(5, undefined as unknown as number, 10);
        expect(agreement).toBe(0.5); // (5 - 0) / 10 = 0.5
      });

      it('should handle all zeros', () => {
        const agreement = calculateAgreement(0, 0, 1);
        expect(agreement).toBe(0);
      });

      it('should handle single evaluator', () => {
        const agreement = calculateAgreement(1, 0, 1);
        expect(agreement).toBe(1);
      });

      it('should handle large numbers', () => {
        const agreement = calculateAgreement(1000000, 500000, 1000);
        expect(agreement).toBe(500); // (1000000 - 500000) / 1000
      });
    });

    describe('boundary values', () => {
      it('should return 1 for maximum agreement', () => {
        const agreement = calculateAgreement(10, 0, 10);
        expect(agreement).toBe(1);
      });

      it('should return -1 for maximum disagreement', () => {
        const agreement = calculateAgreement(0, 10, 10);
        expect(agreement).toBe(-1);
      });
    });
  });

  describe('getFallbackColor', () => {
    describe('known CSS variables', () => {
      it('should return correct fallback for --range-objections-100', () => {
        const color = getFallbackColor('--range-objections-100');
        expect(color).toBe('#D32F2F');
      });

      it('should return correct fallback for --range-objections-60', () => {
        const color = getFallbackColor('--range-objections-60');
        expect(color).toBe('#E57373');
      });

      it('should return correct fallback for --range-objections-30', () => {
        const color = getFallbackColor('--range-objections-30');
        expect(color).toBe('#FFCDD2');
      });

      it('should return correct fallback for --range-conflict-100', () => {
        const color = getFallbackColor('--range-conflict-100');
        expect(color).toBe('#FFA000');
      });

      it('should return correct fallback for --range-conflict-60', () => {
        const color = getFallbackColor('--range-conflict-60');
        expect(color).toBe('#FFB74D');
      });

      it('should return correct fallback for --range-conflict-30', () => {
        const color = getFallbackColor('--range-conflict-30');
        expect(color).toBe('#FFE0B2');
      });

      it('should return correct fallback for --range-positive-30', () => {
        const color = getFallbackColor('--range-positive-30');
        expect(color).toBe('#C8E6C9');
      });

      it('should return correct fallback for --range-positive-60', () => {
        const color = getFallbackColor('--range-positive-60');
        expect(color).toBe('#81C784');
      });

      it('should return correct fallback for --range-positive-100', () => {
        const color = getFallbackColor('--range-positive-100');
        expect(color).toBe('#388E3C');
      });
    });

    describe('unknown CSS variables', () => {
      it('should return default grey for unknown variable', () => {
        const color = getFallbackColor('--unknown-variable');
        expect(color).toBe('#9E9E9E');
      });

      it('should return default grey for empty string', () => {
        const color = getFallbackColor('');
        expect(color).toBe('#9E9E9E');
      });

      it('should return default grey for random string', () => {
        const color = getFallbackColor('random-string');
        expect(color).toBe('#9E9E9E');
      });
    });

    describe('return format', () => {
      it('should always return a valid hex color', () => {
        const colors = [
          '--range-objections-100',
          '--range-positive-100',
          '--unknown',
        ].map(getFallbackColor);

        colors.forEach(color => {
          expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        });
      });
    });
  });

  describe('integration', () => {
    it('should work together: calculateAgreement -> getAgreementColor -> getFallbackColor', () => {
      const agreement = calculateAgreement(8, 2, 10); // 0.6 agreement
      const cssVar = getAgreementColor(agreement);
      const hexColor = getFallbackColor(cssVar);

      expect(typeof agreement).toBe('number');
      expect(cssVar).toMatch(/^--range-/);
      expect(hexColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('should handle negative agreement flow', () => {
      const agreement = calculateAgreement(2, 8, 10); // -0.6 agreement
      const cssVar = getAgreementColor(agreement);
      const hexColor = getFallbackColor(cssVar);

      expect(agreement).toBe(-0.6);
      expect(cssVar).toMatch(/--range-objections/);
      expect(hexColor).toMatch(/^#/);
    });
  });
});
