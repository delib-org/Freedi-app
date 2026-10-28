import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import {
	CLASS_TABLES_COLLECTION,
	Collections,
	MAX_TABLE_SIZE,
	MIN_TABLE_SIZE,
	Role,
	classTableId,
	functionConfig,
	tableSizeOf,
} from '@freedi/shared-types';
import type {
	ClassAssignTablesRequest,
	ClassAssignTablesResponse,
	ClassTable,
	Statement,
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
import { assertLessonRunning } from './lessonStatusGuard';
import { Rng, SeatableStudent, assignStudents } from './assignTables';

/**
 * `classAssignTables` (admin): seat the class. Students = the workspace's
 * `role: member` subscriptions (admins / creators are not seated). Each table
 * mixes the sides (round-robin by camp, see assignTables.ts), 2-8 per table.
 *
 * Group size: the lesson's saved `statementSettings.tableSize` (tableSizeOf,
 * default 6) ALWAYS wins, so every deal and reshuffle of a lesson uses the one
 * size the teacher chose. The request's `tableSize` is only a fallback for a
 * lesson that has none saved; it is validated either way.
 *
 * A second run needs `replace: true` and replaces cleanly in ONE transaction:
 * old tables deleted (no-device members go with them), every old tableId
 * cleared, new tables and tableIds written.
 */

function validTableSize(value: unknown): number | undefined {
	if (value === undefined) return undefined;
	if (
		typeof value !== 'number' ||
		!Number.isInteger(value) ||
		value < MIN_TABLE_SIZE ||
		value > MAX_TABLE_SIZE
	) {
		throw new ClassroomError(
			'invalid-argument',
			`tableSize must be a whole number from ${MIN_TABLE_SIZE} to ${MAX_TABLE_SIZE}`,
		);
	}

	return value;
}

/** The lesson's saved size, else the (validated) request fallback, else the default. */
function tableSizeFor(main: Statement, requested: number | undefined): number {
	const saved = main.statementSettings?.tableSize;
	if (saved !== undefined) return tableSizeOf(main);

	return requested ?? tableSizeOf(main);
}

export function newTable(mainId: string, n: number, memberUids: string[], now: number): ClassTable {
	return {
		tableId: classTableId(mainId, n),
		mainId,
		n,
		memberUids,
		noDeviceMembers: [],
		step: 'pick',
		askerUid: null,
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
	const requested = validTableSize(req?.tableSize);
	const replace = req?.replace === true;
	const main = await assertWorkspaceAdmin(firestore, mainId, uid);
	assertLessonRunning(main);
	const size = tableSizeFor(main, requested);

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
				newTable(mainId, t.n, t.memberUids, now),
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
