import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import {
	CLASS_TABLES_COLLECTION,
	Collections,
	DEFAULT_TABLE_SIZE,
	Role,
	TABLE_SIZES,
	classTableId,
	functionConfig,
} from '@freedi/shared-types';
import type {
	ClassAssignTablesRequest,
	ClassAssignTablesResponse,
	ClassTable,
	StatementSubscription,
} from '@freedi/shared-types';
import { db } from '../db';
import {
	assertWorkspaceAdmin,
	requireId,
	requireUid,
	subscriptionDocId,
	tableRef,
} from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { Rng, SeatableStudent, assignStudents } from './assignTables';

/**
 * `classAssignTables` (admin): seat the class. Students = the workspace's
 * `role: member` subscriptions (admins / creators are not seated). Each table
 * mixes the sides (round-robin by camp, see assignTables.ts), 3-5 per table.
 *
 * A second run needs `replace: true` and replaces cleanly in ONE transaction:
 * old tables deleted (no-device members go with them), every old tableId
 * cleared, new tables and tableIds written.
 */

function validTableSize(value: unknown): number {
	if (value === undefined) return DEFAULT_TABLE_SIZE;
	if (!(TABLE_SIZES as readonly number[]).includes(value as number)) {
		throw new ClassroomError('invalid-argument', 'tableSize must be 3, 4 or 5');
	}

	return value as number;
}

export function newTable(
	mainId: string,
	n: number,
	memberUids: string[],
	askerUid: string | null,
	now: number,
): ClassTable {
	return {
		tableId: classTableId(mainId, n),
		mainId,
		n,
		memberUids,
		noDeviceMembers: [],
		step: 'pick',
		askerUid,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: now,
	};
}

export async function assignTables(
	firestore: Firestore,
	uid: string,
	req: ClassAssignTablesRequest,
	rng: Rng = Math.random,
): Promise<ClassAssignTablesResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const size = validTableSize(req?.tableSize);
	const replace = req?.replace === true;
	await assertWorkspaceAdmin(firestore, mainId, uid);

	const subsQuery = firestore
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', mainId)
		.where('role', '==', Role.member);
	const tablesQuery = firestore.collection(CLASS_TABLES_COLLECTION).where('mainId', '==', mainId);

	return firestore.runTransaction(async (tx) => {
		const [subsSnap, oldTablesSnap] = await Promise.all([tx.get(subsQuery), tx.get(tablesQuery)]);
		if (!oldTablesSnap.empty && !replace) {
			throw new ClassroomError(
				'already-exists',
				'Tables are already set; pass replace: true to re-seat',
			);
		}

		const subs = subsSnap.docs.map((d) => d.data() as StatementSubscription);
		const students: SeatableStudent[] = subs.map((s) => ({
			uid: s.userId,
			camp: s.camp,
			side: s.side,
			joinedAt: s.createdAt ?? 0,
		}));
		const seated = assignStudents(students, size, rng);
		const placedUids = new Set(seated.flatMap((t) => t.memberUids));

		// Old seats of people who are no longer member subscriptions (left,
		// promoted, banned): their docs are read so a cleared tableId is never
		// written onto a missing document.
		const memberUids = new Set(subs.map((s) => s.userId));
		const strays = [
			...new Set(oldTablesSnap.docs.flatMap((d) => (d.data() as ClassTable).memberUids ?? [])),
		].filter((m) => !memberUids.has(m));
		const strayRefs = strays.map((m) =>
			firestore.collection(Collections.statementsSubscribe).doc(subscriptionDocId(mainId, m)),
		);
		const straySnaps = strayRefs.length > 0 ? await tx.getAll(...strayRefs) : [];

		// ---- writes (all reads are done) ----
		const now = Date.now();
		const newIds = new Set(seated.map((t) => classTableId(mainId, t.n)));
		oldTablesSnap.docs.forEach((d) => {
			if (!newIds.has(d.id)) tx.delete(d.ref);
		});
		seated.forEach((t) => {
			tx.set(
				tableRef(firestore, classTableId(mainId, t.n)),
				newTable(mainId, t.n, t.memberUids, t.askerUid, now),
			);
		});
		subsSnap.docs.forEach((d) => {
			const sub = d.data() as StatementSubscription;
			const seat = seated.find((t) => t.memberUids.includes(sub.userId));
			if (seat) {
				tx.update(d.ref, { tableId: classTableId(mainId, seat.n), lastUpdate: now });
			} else if (sub.tableId) {
				tx.update(d.ref, { tableId: FieldValue.delete(), lastUpdate: now });
			}
		});
		straySnaps.forEach((snap) => {
			if (snap.exists && (snap.data() as StatementSubscription).tableId) {
				tx.update(snap.ref, { tableId: FieldValue.delete(), lastUpdate: now });
			}
		});

		return { tables: seated.length, placed: placedUids.size };
	});
}

export const classAssignTables = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ClassAssignTablesRequest>,
	): Promise<ClassAssignTablesResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await assignTables(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classAssignTables',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { tableSize: request.data?.tableSize, replace: request.data?.replace },
			});
		}
	},
);
