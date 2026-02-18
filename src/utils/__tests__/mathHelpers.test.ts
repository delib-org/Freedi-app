import {
	add,
	subtract,
	multiply,
	divide,
	average,
	clamp,
	percentage,
	roundToDecimal,
} from '../mathHelpers';

describe('mathHelpers', () => {
	describe('add', () => {
		it('should add two positive numbers', () => {
			expect(add(2, 3)).toBe(5);
		});

		it('should add negative numbers', () => {
			expect(add(-2, -3)).toBe(-5);
		});

		it('should add zero', () => {
			expect(add(5, 0)).toBe(5);
		});
	});

	describe('subtract', () => {
		it('should subtract two numbers', () => {
			expect(subtract(5, 3)).toBe(2);
		});

		it('should handle negative results', () => {
			expect(subtract(3, 5)).toBe(-2);
		});
	});

	describe('multiply', () => {
		it('should multiply two numbers', () => {
			expect(multiply(3, 4)).toBe(12);
		});

		it('should handle multiplication by zero', () => {
			expect(multiply(5, 0)).toBe(0);
		});

		it('should handle negative numbers', () => {
			expect(multiply(-3, 4)).toBe(-12);
			expect(multiply(-3, -4)).toBe(12);
		});
	});

	describe('divide', () => {
		it('should divide two numbers', () => {
			expect(divide(10, 2)).toBe(5);
		});

		it('should handle decimal results', () => {
			expect(divide(5, 2)).toBe(2.5);
		});

		it('should throw error for division by zero', () => {
			expect(() => divide(5, 0)).toThrow('Division by zero');
		});
	});

	describe('average', () => {
		it('should calculate average of numbers', () => {
			expect(average([1, 2, 3, 4, 5])).toBe(3);
		});

		it('should handle single number', () => {
			expect(average([5])).toBe(5);
		});

		it('should handle negative numbers', () => {
			expect(average([-1, -2, -3])).toBe(-2);
		});

		it('should throw error for empty array', () => {
			expect(() => average([])).toThrow('Cannot calculate average of empty array');
		});
	});

	describe('clamp', () => {
		it('should clamp value within range', () => {
			expect(clamp(5, 0, 10)).toBe(5);
		});

		it('should clamp to minimum', () => {
			expect(clamp(-5, 0, 10)).toBe(0);
		});

		it('should clamp to maximum', () => {
			expect(clamp(15, 0, 10)).toBe(10);
		});

		it('should handle equal min and max', () => {
			expect(clamp(5, 3, 3)).toBe(3);
		});
	});

	describe('percentage', () => {
		it('should calculate percentage', () => {
			expect(percentage(25, 100)).toBe(25);
		});

		it('should handle decimal percentages', () => {
			expect(percentage(1, 3)).toBeCloseTo(33.333, 3);
		});

		it('should return 0 for zero total', () => {
			expect(percentage(5, 0)).toBe(0);
		});

		it('should handle 100%', () => {
			expect(percentage(50, 50)).toBe(100);
		});
	});

	describe('roundToDecimal', () => {
		it('should round to specified decimal places', () => {
			expect(roundToDecimal(3.14159, 2)).toBe(3.14);
		});

		it('should round to whole number', () => {
			expect(roundToDecimal(3.7, 0)).toBe(4);
		});

		it('should handle negative numbers', () => {
			expect(roundToDecimal(-3.14159, 2)).toBe(-3.14);
		});

		it('should handle many decimal places', () => {
			expect(roundToDecimal(3.14159265, 5)).toBe(3.14159);
		});
	});
});
