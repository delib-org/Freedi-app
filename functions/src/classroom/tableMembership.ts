import type { ClassTable } from '@freedi/shared-types';
import { nextAsker } from './tableTransitions';

/**
 * Pure membership edits behind `classMoveStudent`. The callable keeps the
 * table docs and the student's `subscription.tableId` consistent by writing
 * the results of these in one transaction.
 */

/** First member who has not asked, scanning seats from `start` (the seat the leaver held) and wrapping. */
function nextNotAskedFrom(
	memberUids: string[],
	askedUids: string[] | undefined,
	start: number,
): string {
	const asked = new Set(askedUids ?? []);
	for (let k = 0; k < memberUids.length; k++) {
		const uid = memberUids[(start + k) % memberUids.length];
		if (!asked.has(uid)) return uid;
	}

	return memberUids[start % memberUids.length];
}

/**
 * Take `uid` off a table. When the asker leaves, the asker role passes to the
 * next tablemate who has not asked yet, in seating order from the leaver's seat
 * (the next one seated when everyone has asked; null when the table empties);
 * a speaker who leaves loses the floor. The leaver also leaves `askedUids`.
 */
export function removeMember(table: ClassTable, uid: string, now: number): ClassTable {
	if (!table.memberUids.includes(uid)) return table;
	const i = table.memberUids.indexOf(uid);
	const memberUids = table.memberUids.filter((m) => m !== uid);
	const askedUids = table.askedUids?.filter((m) => m !== uid);
	let askerUid = table.askerUid;
	if (askerUid === uid) {
		askerUid = memberUids.length === 0 ? null : nextNotAskedFrom(memberUids, askedUids, i);
	}
	const next: ClassTable = {
		...table,
		memberUids,
		askerUid,
		spokenUids: table.spokenUids.filter((m) => m !== uid),
		updatedAt: now,
	};
	if (askedUids) next.askedUids = askedUids;
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
