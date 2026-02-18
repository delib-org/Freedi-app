export function add(a: number, b: number): number {
	return a + b;
}

export function subtract(a: number, b: number): number {
	return a - b;
}

export function multiply(a: number, b: number): number {
	return a * b;
}

export function divide(a: number, b: number): number {
	if (b === 0) {
		throw new Error('Division by zero');
	}

	return a / b;
}

export function average(numbers: number[]): number {
	if (numbers.length === 0) {
		throw new Error('Cannot calculate average of empty array');
	}
	const sum = numbers.reduce((acc, num) => acc + num, 0);

	return sum / numbers.length;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function percentage(value: number, total: number): number {
	if (total === 0) {
		return 0;
	}

	return (value / total) * 100;
}

export function roundToDecimal(value: number, decimals: number): number {
	const multiplier = Math.pow(10, decimals);

	return Math.round(value * multiplier) / multiplier;
}
