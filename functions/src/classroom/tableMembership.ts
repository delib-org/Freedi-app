import type { ClassTable } from '@freedi/shared-types';
import { nextAsker } from './tableTransitions';

/**
 * Pure membership edits behind `classMoveStudent`. The callable keeps the
 * table docs and the student's `subscription.tableId` consistent by writing
 * the results of these in one transaction.
 */

/**
 * Take `uid` off a table. When the asker leaves, the asker role passes to the
 * next tablemate in seating order (null when the table empties); a speaker who
 * leaves loses the floor.
 */
export function removeMember(table: ClassTable, uid: string, now: number): ClassTable {
	if (!table.memberUids.includes(uid)) return table;
	const i = table.memberUids.indexOf(uid);
	const memberUids = table.memberUids.filter((m) => m !== uid);
	let askerUid = table.askerUid;
	if (askerUid === uid) {
		// The member seated after the leaver now sits at index i.
		askerUid = memberUids.length === 0 ? null : memberUids[i % memberUids.length];
	}
	const next: ClassTable = {
		...table,
		memberUids,
		askerUid,
		spokenUids: table.spokenUids.filter((m) => m !== uid),
		updatedAt: now,
	};
	if (next.speakerUid === uid) {
		delete next.speakerUid;
		delete next.speakerEndsAt;
	}

	return next;
}

/** Seat `uid` at a table (last in seating order). An askerless table gets them as asker. */
export function addMember(table: ClassTable, uid: string, now: number): ClassTable {
	if (table.memberUids.includes(uid)) return table;
	const memberUids = [...table.memberUids, uid];

	return {
		...table,
		memberUids,
		askerUid: table.askerUid ?? nextAsker(memberUids, null),
		updatedAt: now,
	};
}
