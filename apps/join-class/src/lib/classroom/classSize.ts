import type { Statement } from '@freedi/shared-types';

/**
 * How many students are in the class (N), the field scoring reads as
 * `evaluationSettings.targetPopulation`. The lesson holds the declared value
 * and each of its questions carries a copy (`createSubQuestion` copies it from
 * the lesson). The teacher types it per lesson; the goal (`DEFAULT_GATE`) is
 * unchanged.
 */

/** Used when the teacher leaves the number empty (or types something that is not one). */
export const DEFAULT_CLASS_SIZE = 40;

/** A positive whole number, or undefined when the input does not name one. */
function positiveWhole(raw: unknown): number | undefined {
	const value = typeof raw === 'string' ? parseInt(raw, 10) : raw;
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	const whole = Math.floor(value);

	return whole >= 1 ? whole : undefined;
}

/** What the teacher's input means: empty, 0, negative or not a number all mean the default. */
export function parseClassSize(raw: unknown): number {
	return positiveWhole(raw) ?? DEFAULT_CLASS_SIZE;
}

/** The N a lesson or question already carries; undefined for an open-population lesson. */
export function storedClassSize(statement: Statement | null | undefined): number | undefined {
	return positiveWhole(statement?.evaluationSettings?.targetPopulation);
}

/** The fields to merge onto the lesson and each question. Never 0 or null. */
export function classSizePatch(size: number): { evaluationSettings: { targetPopulation: number } } {
	return { evaluationSettings: { targetPopulation: parseClassSize(size) } };
}
