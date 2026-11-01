import { moveOnNeeded, moveOnPressers } from '@freedi/shared-types';
import type { ClassTable } from '@freedi/shared-types';

/** What the "move on" control shows one student: the count, the goal and whether they pressed. */
export interface MoveOnView {
	count: number;
	needed: number;
	pressed: boolean;
}

export function moveOnView(table: ClassTable, uid: string): MoveOnView {
	const pressers = moveOnPressers(table);

	return {
		count: pressers.length,
		needed: moveOnNeeded(table.memberUids.length),
		pressed: pressers.includes(uid),
	};
}
