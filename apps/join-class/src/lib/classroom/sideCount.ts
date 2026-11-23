/**
 * How many joined students have chosen a side (the teacher's "18 of 24 chose").
 * `chosen` comes from the subscription's `sidePickedAt`: the teacher learns
 * THAT a student chose, never WHICH (rosterPrivacy.ts).
 */

export interface SideCount {
	chose: number;
	total: number;
}

export function sideCount(students: readonly { chosen: boolean }[]): SideCount {
	return {
		chose: students.filter((s) => s.chosen).length,
		total: students.length,
	};
}
