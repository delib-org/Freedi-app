import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import {
	CLASS_TABLES_COLLECTION,
	Collections,
	MAX_NO_DEVICE_PER_TABLE,
	NO_DEVICE_ID_PREFIX,
	classRegistrationOf,
	classTableId,
	functionConfig,
} from '@freedi/shared-types';
import type {
	ClassAddNoDeviceRequest,
	ClassAddNoDeviceResponse,
	ClassTable,
	NoDeviceMember,
} from '@freedi/shared-types';
import { db } from '../db';
import { assertWorkspaceAdmin, requireId, requireUid, tableRef } from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { assertLessonRunning } from './lessonStatusGuard';
import { countNoDevice } from './noDeviceMembers';
import { registrationSeatByIdQuery } from './registration/registrationAccess';
import type { RegistrationSeatDoc } from './registration/registrationAccess';

/**
 * `classAddNoDevice` (admin): put a named student who has no phone on table
 * `n` ("בלי מכשיר"). Roster-only: no uid, never an asker or a speaker uid.
 * Also keeps `statementSettings.noDeviceCount` on the lesson, recounted from the
 * tables in the same transaction: phones cannot read other tables, and they
 * need the count to say how many are in the room.
 *
 * With `seatId` (a connected lesson, IA tables-class-bridge 5.4) a registered
 * person who is here without a phone takes their reserved seat: the seat
 * becomes them, under the registration's name, and they count as arrived.
 */

export const MAX_NO_DEVICE_NAME = 60;
export { MAX_NO_DEVICE_PER_TABLE };

export function cleanNoDeviceName(value: unknown): string {
	const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
	if (name.length === 0 || name.length > MAX_NO_DEVICE_NAME) {
		throw new ClassroomError('invalid-argument', `name must be 1-${MAX_NO_DEVICE_NAME} characters`);
	}

	return name;
}

/** The reserved seat `seatId` turned into a person without a phone, read inside `tx`. */
async function takeReservedSeat(
	tx: Transaction,
	firestore: Firestore,
	mainId: string,
	table: ClassTable,
	seatId: string,
): Promise<{ name: string; ledgerRef: DocumentReference; ledger: RegistrationSeatDoc }> {
	const seat = (table.reservedSeats ?? []).find((s) => s.seatId === seatId);
	const ledgerSnap = (await tx.get(registrationSeatByIdQuery(firestore, mainId, seatId))).docs[0];
	if (!seat || !ledgerSnap) {
		throw new ClassroomError(
			'failed-precondition',
			'This seat is no longer reserved',
			'seat-taken',
		);
	}

	return {
		name: seat.name,
		ledgerRef: ledgerSnap.ref,
		ledger: ledgerSnap.data() as RegistrationSeatDoc,
	};
}

export async function addNoDevice(
	firestore: Firestore,
	actorUid: string,
	req: ClassAddNoDeviceRequest,
): Promise<ClassAddNoDeviceResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const n = req?.n;
	if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
		throw new ClassroomError('invalid-argument', 'n must be a table number');
	}
	const seatId = req?.seatId === undefined ? undefined : requireId(req.seatId, 'seatId');
	const typedName = seatId === undefined ? cleanNoDeviceName(req?.name) : undefined;
	const main = await assertWorkspaceAdmin(firestore, mainId, actorUid);
	assertLessonRunning(main);
	if (seatId !== undefined && !classRegistrationOf(main)) {
		throw new ClassroomError(
			'failed-precondition',
			'No registration is connected',
			'not-connected',
		);
	}

	const ref = tableRef(firestore, classTableId(mainId, n));
	const mainRef = firestore.collection(Collections.statements).doc(mainId);
	const tablesQuery = firestore.collection(CLASS_TABLES_COLLECTION).where('mainId', '==', mainId);
	const id = `${NO_DEVICE_ID_PREFIX}${randomUUID()}`;
	await firestore.runTransaction(async (tx) => {
		const [snap, tablesSnap] = await Promise.all([tx.get(ref), tx.get(tablesQuery)]);
		if (!snap.exists) throw new ClassroomError('not-found', `Table ${n} does not exist`);
		const table = snap.data() as ClassTable;
		const current = table.noDeviceMembers ?? [];
		if (current.length >= MAX_NO_DEVICE_PER_TABLE) {
			throw new ClassroomError(
				'resource-exhausted',
				'This table already has the most no-device members',
			);
		}
		const reserved = seatId
			? await takeReservedSeat(tx, firestore, mainId, table, seatId)
			: undefined;
		const member: NoDeviceMember = { id, name: reserved?.name ?? (typedName as string) };

		// ---- writes (all reads are done) ----
		const now = Date.now();
		tx.update(ref, {
			noDeviceMembers: [...current, member],
			...(seatId
				? { reservedSeats: (table.reservedSeats ?? []).filter((s) => s.seatId !== seatId) }
				: {}),
			updatedAt: now,
		});
		tx.update(mainRef, {
			'statementSettings.noDeviceCount':
				countNoDevice(tablesSnap.docs.map((d) => d.data() as ClassTable)) + 1,
			...(reserved && reserved.ledger.arrivedAt === undefined
				? { 'statementSettings.classRegistration.arrivedCount': FieldValue.increment(1) }
				: {}),
			lastUpdate: now,
		});
		if (reserved) {
			tx.update(reserved.ledgerRef, {
				noDeviceId: member.id,
				arrivedAt: reserved.ledger.arrivedAt ?? now,
			});
		}
	});

	return { id };
}

export const classAddNoDevice = onCall(
	{ region: functionConfig.region, memory: '512MiB' },
	async (request: CallableRequest<ClassAddNoDeviceRequest>): Promise<ClassAddNoDeviceResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await addNoDevice(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classAddNoDevice',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { n: request.data?.n },
			});
		}
	},
);
