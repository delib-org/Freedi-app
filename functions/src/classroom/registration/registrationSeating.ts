import { takenSeatsOf, tableAssignmentNameKey } from '@freedi/shared-types';
import type { ClassTable, NoDeviceMember, ReservedSeat } from '@freedi/shared-types';
import { carryNoDeviceMembers, newTable } from '../assignTables';
import type { RegistrationSeatDoc } from './registrationAccess';

/**
 * Pure seating rules of a connected lesson (IA tables-class-bridge 5.3, 5.4).
 * The callables read, call these, and write what they return.
 */

/** One published table of the registration. */
export interface RunTableInput {
	/** 0-based in Tables; the Class table number is index + 1. */
	index: number;
	topicId: string;
	/** Registration (Tables) uids. */
	memberUids: readonly string[];
}

export interface CopyInput {
	mainId: string;
	sessionId: string;
	now: number;
	runTables: readonly RunTableInput[];
	/** Topic titles by id; undefined in a one-topic event (no topic line). */
	topicTitles: ReadonlyMap<string, string> | undefined;
	/** Registered full names by registration uid (the Tables roster). */
	names: ReadonlyMap<string, string>;
	/** What the lesson already knows about registrations (arrivals before copying, an earlier copy). */
	ledger: readonly RegistrationSeatDoc[];
	/** Members without a registration, oldest first: they take free seats after everyone registered. */
	walkInUids: readonly string[];
	/** The lesson's tables before copying: people without a phone are carried over. */
	oldTables: readonly ClassTable[];
	seatsPerTable: number;
	newSeatId: () => string;
}

export interface CopyPlan {
	tables: ClassTable[];
	/** Every ledger doc as it must be after copying (a full replacement of each). */
	ledger: RegistrationSeatDoc[];
	/** Class uid -> table number, for every member who got a seat. */
	seatOf: Map<string, number>;
	arrived: number;
	reserved: number;
	walkInsSeated: number;
	withoutTable: number;
}

/** The table number of a registration's run table. */
export function classTableNumberOf(runIndex: number): number {
	return runIndex + 1;
}

/**
 * The table a person joining without a seat goes to: the one with the fewest
 * taken seats (present, without a phone and reserved) that still has a free
 * seat; the lowest number on a tie. Undefined when every table is full.
 */
export function pickWalkInTable(
	tables: readonly ClassTable[],
	seatsPerTable: number,
): ClassTable | undefined {
	let best: ClassTable | undefined;
	for (const table of tables) {
		const taken = takenSeatsOf(table);
		if (taken >= seatsPerTable) continue;
		if (!best || taken < takenSeatsOf(best) || (taken === takenSeatsOf(best) && table.n < best.n)) {
			best = table;
		}
	}

	return best;
}

/** The ledger doc of a registration as copied to table `n` (fields not given are dropped). */
function copiedLedgerDoc(
	input: CopyInput,
	registrationUid: string,
	known: RegistrationSeatDoc | undefined,
	fullName: string,
	table: { n: number; topic?: string },
): RegistrationSeatDoc {
	const doc: RegistrationSeatDoc = {
		mainId: input.mainId,
		sessionId: input.sessionId,
		registrationUid,
		fullName,
		nameKey: tableAssignmentNameKey(fullName),
		seatId: known?.seatId ?? input.newSeatId(),
		tableN: table.n,
	};
	if (table.topic !== undefined) doc.topic = table.topic;
	if (known?.classUid) doc.classUid = known.classUid;
	if (known?.noDeviceId) doc.noDeviceId = known.noDeviceId;
	if (known?.arrivedAt !== undefined) doc.arrivedAt = known.arrivedAt;

	return doc;
}

function noDeviceById(tables: readonly ClassTable[]): Map<string, NoDeviceMember> {
	return new Map(tables.flatMap((t) => (t.noDeviceMembers ?? []).map((m) => [m.id, m] as const)));
}

/**
 * The lesson's tables made from the published registration tables: same
 * numbers, same topics. Arrived people sit at their table, the rest are
 * reserved seats by name, people the teacher added without a phone from a
 * reserved seat stay at their registration's table, other people without a
 * phone keep their table number when it still exists. Then walk-ins (and
 * arrived people the registration does not seat) take the free seats, the
 * emptiest table first. Nobody is moved off a table to make room.
 */
export function planCopySeating(input: CopyInput): CopyPlan {
	const known = new Map(input.ledger.map((doc) => [doc.registrationUid, doc]));
	const noDevice = noDeviceById(input.oldTables);
	const placedNoDevice = new Set<string>();
	const seatedRegistrations = new Set<string>();
	const ledger: RegistrationSeatDoc[] = [];
	const seatOf = new Map<string, number>();
	let arrived = 0;
	let reserved = 0;

	const tables = [...input.runTables]
		.sort((a, b) => a.index - b.index)
		.map((runTable) => {
			const n = classTableNumberOf(runTable.index);
			const topic = input.topicTitles?.get(runTable.topicId);
			const memberUids: string[] = [];
			const noDeviceMembers: NoDeviceMember[] = [];
			const reservedSeats: ReservedSeat[] = [];
			for (const registrationUid of runTable.memberUids) {
				const doc = known.get(registrationUid);
				const fullName = input.names.get(registrationUid) ?? doc?.fullName;
				if (!fullName) continue;
				const copied = copiedLedgerDoc(input, registrationUid, doc, fullName, { n, topic });
				const withoutPhone = copied.noDeviceId ? noDevice.get(copied.noDeviceId) : undefined;
				if (copied.classUid) {
					memberUids.push(copied.classUid);
					seatOf.set(copied.classUid, n);
					arrived++;
				} else if (withoutPhone) {
					noDeviceMembers.push(withoutPhone);
					placedNoDevice.add(withoutPhone.id);
				} else {
					reservedSeats.push({ seatId: copied.seatId, name: fullName });
					reserved++;
				}
				seatedRegistrations.add(registrationUid);
				ledger.push(copied);
			}
			const table = newTable(input.mainId, n, memberUids, input.now, noDeviceMembers);
			if (topic !== undefined) table.topic = topic;
			if (reservedSeats.length > 0) table.reservedSeats = reservedSeats;

			return table;
		});

	// Like a deal: a lesson whose only people have no phone keeps one table for them.
	const withoutPhoneLeft = input.oldTables.some((t) =>
		(t.noDeviceMembers ?? []).some((m) => !placedNoDevice.has(m.id)),
	);
	if (tables.length === 0 && withoutPhoneLeft)
		tables.push(newTable(input.mainId, 1, [], input.now));
	carryOtherNoDevice(input.oldTables, tables, placedNoDevice);

	// Arrived people the published tables do not seat (registered late) sit like walk-ins.
	const unseatedArrivals: string[] = [];
	for (const doc of input.ledger) {
		if (seatedRegistrations.has(doc.registrationUid)) continue;
		const rest: RegistrationSeatDoc = { ...doc };
		delete rest.tableN;
		delete rest.topic;
		ledger.push(rest);
		if (doc.classUid) unseatedArrivals.push(doc.classUid);
	}

	let walkInsSeated = 0;
	let withoutTable = 0;
	for (const uid of [...unseatedArrivals, ...input.walkInUids]) {
		if (seatOf.has(uid)) continue;
		const table = pickWalkInTable(tables, input.seatsPerTable);
		if (!table) {
			withoutTable++;
			continue;
		}
		table.memberUids.push(uid);
		seatOf.set(uid, table.n);
		walkInsSeated++;
	}

	return { tables, ledger, seatOf, arrived, reserved, walkInsSeated, withoutTable };
}

/** People without a phone who came from no reserved seat keep their table number (see carryNoDeviceMembers). */
function carryOtherNoDevice(
	oldTables: readonly ClassTable[],
	tables: ClassTable[],
	placed: ReadonlySet<string>,
): void {
	if (tables.length === 0) return;
	const others = oldTables.map((t) => ({
		n: t.n,
		noDeviceMembers: (t.noDeviceMembers ?? []).filter((m) => !placed.has(m.id)),
	}));
	const carried = carryNoDeviceMembers(
		others,
		tables.map((t) => t.n),
	);
	for (const table of tables) {
		table.noDeviceMembers = [...table.noDeviceMembers, ...(carried.get(table.n) ?? [])];
	}
}
