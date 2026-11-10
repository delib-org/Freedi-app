import { TABLE_ASSIGNMENT_STRICTNESS } from '@freedi/shared-types';

export type StrictnessChip = keyof typeof TABLE_ASSIGNMENT_STRICTNESS;

export const STRICTNESS_CHIPS: readonly StrictnessChip[] = ['strict', 'balanced', 'flexible'];

const EPSILON = 1e-9;
const EXPERT_DECIMALS = 2;

export function toleranceOfChip(chip: StrictnessChip): number {
	return TABLE_ASSIGNMENT_STRICTNESS[chip];
}

/** The chip a stored tolerance belongs to; any other number stays a custom value with no chip. */
export function chipOfTolerance(tolerance: number): StrictnessChip | 'custom' {
	const chip = STRICTNESS_CHIPS.find(
		(candidate) => Math.abs(TABLE_ASSIGNMENT_STRICTNESS[candidate] - tolerance) < EPSILON,
	);

	return chip ?? 'custom';
}

export function formatTolerance(tolerance: number): string {
	return tolerance.toFixed(EXPERT_DECIMALS);
}
