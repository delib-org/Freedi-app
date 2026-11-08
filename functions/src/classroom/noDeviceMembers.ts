import { isNoDeviceId } from '@freedi/shared-types';
import type { ClassTable, Creator, NoDeviceMember } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

/**
 * Students without a device: the teacher writes and votes for them, by id. The id
 * must name a member of a table of THIS lesson, so neither another lesson's student
 * nor a real student's uid can be acted for.
 */

export interface SeatedNoDevice {
	member: NoDeviceMember;
	table: ClassTable;
}

/** The no-device student `id` at one of `tables`, or a refusal. `tables` are this lesson's only. */
export function requireNoDeviceMember(
	tables: readonly ClassTable[],
	mainId: string,
	id: string,
): SeatedNoDevice {
	if (isNoDeviceId(id)) {
		for (const table of tables) {
			if (table.mainId !== mainId) continue;
			const member = (table.noDeviceMembers ?? []).find((m) => m.id === id);
			if (member) return { member, table };
		}
	}
	throw new ClassroomError(
		'not-found',
		'No student without a device has this id in this lesson',
		'not-no-device',
	);
}

/**
 * The author of a proposal entered for this student: the id and nothing else. Every phone
 * loads proposals, and the name lives on the tables only table-mates and the teacher can
 * read, so the teacher's screens resolve it by id.
 */
export function noDeviceCreator(id: string): Creator {
	return { uid: id, displayName: '', photoURL: null, isAnonymous: true };
}

/** Students without a device at these tables. */
export function countNoDevice(tables: readonly Pick<ClassTable, 'noDeviceMembers'>[]): number {
	return tables.reduce((sum, table) => sum + (table.noDeviceMembers ?? []).length, 0);
}
