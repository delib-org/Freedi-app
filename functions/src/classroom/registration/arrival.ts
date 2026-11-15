import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import {
	CLASS_TABLES_COLLECTION,
	Collections,
	Role,
	classTableId,
	lessonStatusOf,
	seatsPerTableOf,
	tableAssignmentNameKey,
	takenSeatsOf,
} from '@freedi/shared-types';
import type {
	ClassArrival,
	ClassTable,
	Statement,
	StatementSubscription,
	TableAssignmentRun,
} from '@freedi/shared-types';
import { subscriptionDocId, subscriptionRef, tableRef } from '../classroomAccess';
import { ClassroomError } from '../classroomErrors';
import { lessonStepOf } from '../lessonStatusGuard';
import { addMember, removeMember } from '../tableMembership';
import { newSeatId, registrationSeatRef } from './registrationAccess';
import type { ConnectedLesson, RegistrationSeatDoc } from './registrationAccess';
import { classTableNumberOf, pickWalkInTable } from './registrationSeating';

/**
 * Arriving in a connected lesson (IA tables-class-bridge 5.1, 5.2, 5.4): a
 * registration joined to a Class member. One registration, one device at a
 * time: the latest device holds the seat and the one before is told so.
 */

/** The member subscription a server arrival writes (the same doc a phone makes for itself). */
function memberSubscription(
	main: Statement,
	uid: string,
	fullName: string,
	now: number,
): StatementSubscription {
	return {
		statementsSubscribeId: subscriptionDocId(main.statementId, uid),
		userId: uid,
		statementId: main.statementId,
		statement: main,
		user: { uid, displayName: fullName, photoURL: null, isAnonymous: true },
		role: Role.member,
		parentId: main.parentId,
		statementType: main.statementType,
		topParentId: main.topParentId || main.parentId,
		lastUpdate: now,
		createdAt: now,
	};
}

function assertMayJoin(sub: StatementSubscription | undefined): void {
	if (sub?.role === Role.banned) {
		throw new ClassroomError('permission-denied', 'You cannot join this lesson');
	}
}

/** Writes the caller's member subscription: the name, the table, and no "seat moved" mark. */
function writeCallerSubscription(
	tx: Transaction,
	firestore: Firestore,
	main: Statement,
	callerUid: string,
	snap: DocumentSnapshot,
	fullName: string,
	tableN: number | null,
	now: number,
): void {
	const ref = subscriptionRef(firestore, main.statementId, callerUid);
	const tableId = tableN === null ? undefined : classTableId(main.statementId, tableN);
	if (!snap.exists) {
		const sub = memberSubscription(main, callerUid, fullName, now);
		tx.set(ref, tableId ? { ...sub, tableId } : sub);

		return;
	}
	tx.update(ref, {
		'user.displayName': fullName,
		tableId: tableId ?? FieldValue.delete(),
		seatMovedAt: FieldValue.delete(),
		lastUpdate: now,
	});
}

/** Tables loaded in one transaction, edited in memory, each written once. */
class TableEdits {
	private readonly tables = new Map<string, ClassTable>();
	private readonly changed = new Set<string>();

	constructor(snaps: readonly DocumentSnapshot[]) {
		for (const snap of snaps) {
			if (snap.exists) this.tables.set(snap.id, snap.data() as ClassTable);
		}
	}

	get(tableId: string | undefined): ClassTable | undefined {
		return tableId ? this.tables.get(tableId) : undefined;
	}

	all(): ClassTable[] {
		return [...this.tables.values()];
	}

	edit(tableId: string, change: (table: ClassTable) => ClassTable): void {
		const table = this.tables.get(tableId);
		if (!table) return;
		this.tables.set(tableId, change(table));
		this.changed.add(tableId);
	}

	write(tx: Transaction, firestore: Firestore): void {
		for (const id of this.changed)
			tx.set(tableRef(firestore, id), this.tables.get(id) as ClassTable);
	}
}

function withoutReservedSeat(table: ClassTable, seatId: string, now: number): ClassTable {
	const reservedSeats = (table.reservedSeats ?? []).filter((s) => s.seatId !== seatId);

	return { ...table, reservedSeats, updatedAt: now };
}

function withoutNoDevice(table: ClassTable, id: string, now: number): ClassTable {
	return {
		...table,
		noDeviceMembers: table.noDeviceMembers.filter((m) => m.id !== id),
		updatedAt: now,
	};
}

/** The registration's table in the published run, as a Class table number. */
async function runTableNumber(
	firestore: Firestore,
	connected: ConnectedLesson,
	registrationUid: string,
): Promise<number | undefined> {
	const runId = connected.session.publishedRunId;
	if (!runId) return undefined;
	const run = (
		await firestore.collection(Collections.tableAssignmentRuns).doc(runId).get()
	).data() as TableAssignmentRun | undefined;
	const table = run?.tables.find((t) => t.memberUids.includes(registrationUid));

	return table ? classTableNumberOf(table.index) : undefined;
}

/** Lesson counters a server arrival keeps; merged so concurrent arrivals never contend on a read. */
function bumpLessonCounters(
	tx: Transaction,
	firestore: Firestore,
	mainId: string,
	counters: { arrived?: boolean; noDeviceLeft?: boolean },
): void {
	if (!counters.arrived && !counters.noDeviceLeft) return;
	const statementSettings: Record<string, unknown> = {};
	if (counters.arrived)
		statementSettings.classRegistration = { arrivedCount: FieldValue.increment(1) };
	if (counters.noDeviceLeft) statementSettings.noDeviceCount = FieldValue.increment(-1);
	tx.set(
		firestore.collection(Collections.statements).doc(mainId),
		{ statementSettings },
		{ merge: true },
	);
}

export interface ArrivalInput {
	connected: ConnectedLesson;
	registrationUid: string;
	/** The registration's full name, as registered. */
	fullName: string;
	callerUid: string;
	now: number;
}

/**
 * The caller takes the registration's seat. Before copying only the link is
 * recorded (the tables are not there yet). After copying the caller sits where
 * the seat is: where the previous device sat, else at the reserved seat, else at
 * the registration's table when it has room, else like a walk-in.
 */
export async function arriveOnRegistration(
	firestore: Firestore,
	input: ArrivalInput,
): Promise<ClassArrival> {
	const { connected, registrationUid, fullName, callerUid, now } = input;
	const { main, registration } = connected;
	const mainId = main.statementId;
	const copied = registration.seatingCopiedAt !== undefined;
	const runN = copied ? await runTableNumber(firestore, connected, registrationUid) : undefined;
	const seatsPerTable = seatsPerTableOf(main, connected.session.settings.tableSize);
	const held = lessonStatusOf(main.statementSettings?.lessonPlan) === 'paused';
	const step = lessonStepOf(main);
	const ledgerRef = registrationSeatRef(firestore, mainId, registrationUid);

	return firestore.runTransaction(async (tx) => {
		const [ledgerSnap, callerSnap] = await Promise.all([
			tx.get(ledgerRef),
			tx.get(subscriptionRef(firestore, mainId, callerUid)),
		]);
		const ledger = ledgerSnap.data() as RegistrationSeatDoc | undefined;
		const callerSub = callerSnap.data() as StatementSubscription | undefined;
		assertMayJoin(callerSub);
		const previous =
			ledger?.classUid && ledger.classUid !== callerUid ? ledger.classUid : undefined;
		const previousSnap = previous
			? await tx.get(subscriptionRef(firestore, mainId, previous))
			: undefined;
		const previousSub = previousSnap?.data() as StatementSubscription | undefined;

		let tables = new TableEdits([]);
		let targetId: string | undefined;
		if (copied) {
			const targetN = ledger?.tableN ?? runN;
			targetId =
				previousSub?.tableId ??
				(ledger?.classUid === callerUid ? callerSub?.tableId : undefined) ??
				(targetN === undefined ? undefined : classTableId(mainId, targetN));
			const ids = [...new Set([targetId, callerSub?.tableId, previousSub?.tableId])].filter(
				(id): id is string => Boolean(id),
			);
			tables = new TableEdits(
				ids.length > 0 ? await tx.getAll(...ids.map((id) => tableRef(firestore, id))) : [],
			);
			const target = tables.get(targetId);
			const ownSeat = Boolean(
				target &&
					(target.reservedSeats?.some((s) => s.seatId === ledger?.seatId) ||
						(previous && target.memberUids.includes(previous)) ||
						target.memberUids.includes(callerUid) ||
						target.noDeviceMembers.some((m) => m.id === ledger?.noDeviceId)),
			);
			if (!target || (!ownSeat && takenSeatsOf(target) >= seatsPerTable)) {
				const all = await tx.get(
					firestore.collection(CLASS_TABLES_COLLECTION).where('mainId', '==', mainId),
				);
				tables = new TableEdits(all.docs);
				targetId = callerSub?.tableId ?? pickWalkInTable(tables.all(), seatsPerTable)?.tableId;
			}
		}

		// ---- writes (all reads are done) ----
		if (previous && previousSub?.tableId) {
			tables.edit(previousSub.tableId, (t) => removeMember(t, previous, now, step, held));
		}
		if (callerSub?.tableId && callerSub.tableId !== targetId) {
			tables.edit(callerSub.tableId, (t) => removeMember(t, callerUid, now, step, held));
		}
		const noDeviceLeft = Boolean(
			ledger?.noDeviceId &&
				tables.all().some((t) => t.noDeviceMembers.some((m) => m.id === ledger.noDeviceId)),
		);
		for (const table of tables.all()) {
			if (ledger?.seatId && table.reservedSeats?.some((s) => s.seatId === ledger.seatId)) {
				tables.edit(table.tableId, (t) => withoutReservedSeat(t, ledger.seatId, now));
			}
			if (ledger?.noDeviceId && table.noDeviceMembers.some((m) => m.id === ledger.noDeviceId)) {
				tables.edit(table.tableId, (t) => withoutNoDevice(t, ledger.noDeviceId as string, now));
			}
		}
		if (targetId) tables.edit(targetId, (t) => addMember(t, callerUid, now));
		const target = tables.get(targetId);
		tables.write(tx, firestore);

		const tableN = target ? target.n : null;
		writeCallerSubscription(tx, firestore, main, callerUid, callerSnap, fullName, tableN, now);
		if (previous && previousSnap?.exists) {
			tx.update(previousSnap.ref, {
				tableId: FieldValue.delete(),
				seatMovedAt: now,
				lastUpdate: now,
			});
		}
		const doc: RegistrationSeatDoc = {
			mainId,
			sessionId: connected.session.tableAssignmentId,
			registrationUid,
			fullName,
			nameKey: tableAssignmentNameKey(fullName),
			seatId: ledger?.seatId ?? newSeatId(),
			classUid: callerUid,
			arrivedAt: ledger?.arrivedAt ?? now,
		};
		if (ledger?.tableN !== undefined) doc.tableN = ledger.tableN;
		if (ledger?.topic !== undefined) doc.topic = ledger.topic;
		tx.set(ledgerRef, doc);
		bumpLessonCounters(tx, firestore, mainId, { arrived: !ledger?.arrivedAt, noDeviceLeft });

		return {
			mainId,
			fullName,
			tableN,
			...(target?.topic ? { topic: target.topic } : {}),
			movedFromAnotherDevice: Boolean(previous),
		};
	});
}

/**
 * Joining a connected lesson without registration ("להצטרף בלי הרשמה", or "not
 * me"): in under the name typed. Once the seating is copied, the walk-in sits
 * at the table with the fewest taken seats that has a free one; with none
 * free they wait for the teacher. Before copying they are seated with the copy.
 */
export async function joinWithoutRegistration(
	firestore: Firestore,
	connected: ConnectedLesson,
	callerUid: string,
	fullName: string,
	now: number,
): Promise<ClassArrival> {
	const { main, registration } = connected;
	const mainId = main.statementId;
	const copied = registration.seatingCopiedAt !== undefined;
	const seatsPerTable = seatsPerTableOf(main, connected.session.settings.tableSize);

	return firestore.runTransaction(async (tx) => {
		const callerSnap = await tx.get(subscriptionRef(firestore, mainId, callerUid));
		const callerSub = callerSnap.data() as StatementSubscription | undefined;
		assertMayJoin(callerSub);
		let tables = new TableEdits([]);
		let targetId = callerSub?.tableId;
		if (copied) {
			const all = await tx.get(
				firestore.collection(CLASS_TABLES_COLLECTION).where('mainId', '==', mainId),
			);
			tables = new TableEdits(all.docs);
			targetId = tables.get(targetId)
				? targetId
				: pickWalkInTable(tables.all(), seatsPerTable)?.tableId;
		}

		// ---- writes (all reads are done) ----
		if (targetId && tables.get(targetId))
			tables.edit(targetId, (t) => addMember(t, callerUid, now));
		tables.write(tx, firestore);
		const target = tables.get(targetId);
		const tableN = target ? target.n : null;
		writeCallerSubscription(tx, firestore, main, callerUid, callerSnap, fullName, tableN, now);

		return {
			mainId,
			fullName,
			tableN,
			...(target?.topic ? { topic: target.topic } : {}),
			movedFromAnotherDevice: false,
		};
	});
}
