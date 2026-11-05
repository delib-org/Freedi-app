import type { Camp } from '@freedi/shared-types';

/**
 * How many joined students have chosen a side (the teacher's "18 of 24 chose").
 * A side is chosen once the student's slider produced a camp.
 */

export interface SideCount {
	chose: number;
	total: number;
}

export function sideCount(students: readonly { camp: Camp | null }[]): SideCount {
	return {
		chose: students.filter((s) => s.camp !== null).length,
		total: students.length,
	};
}
