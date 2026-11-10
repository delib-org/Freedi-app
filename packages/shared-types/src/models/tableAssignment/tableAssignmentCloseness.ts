import { InferOutput, picklist } from 'valibot';

/**
 * How close a table is to the room: the only thing about positions that a run
 * stores. One definition for the Cloud Functions and the apps.
 */

/** Below this many known positions a table says nothing about its composition. */
export const TABLE_ASSIGNMENT_MIN_KNOWN_POSITIONS = 3;

/** A table within this share of the tolerance reads as "very close". */
const VERY_CLOSE_TOLERANCE_SHARE = 0.5;
/** Keeps a deviation exactly on a limit from reading as past it through float noise. */
const CLOSENESS_EPSILON = 1e-9;

export const TableAssignmentClosenessSchema = picklist(['veryClose', 'close', 'far', 'notEnough']);
export type TableAssignmentCloseness = InferOutput<typeof TableAssignmentClosenessSchema>;

/** `n` is how many at the table gave a position; `deviation` is in room-sd units. */
export function tableAssignmentCloseness(
	stats: { n: number; deviation: number },
	tolerance: number,
): TableAssignmentCloseness {
	if (stats.n < TABLE_ASSIGNMENT_MIN_KNOWN_POSITIONS) return 'notEnough';
	if (stats.deviation <= tolerance * VERY_CLOSE_TOLERANCE_SHARE + CLOSENESS_EPSILON) {
		return 'veryClose';
	}

	return stats.deviation <= tolerance + CLOSENESS_EPSILON ? 'close' : 'far';
}
