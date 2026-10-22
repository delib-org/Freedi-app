import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { classTableId, functionConfig } from '@freedi/shared-types';
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

/**
 * `classAddNoDevice` (admin): put a named student who has no phone on table
 * `n` ("בלי מכשיר"). Roster-only: no uid, never an asker or a speaker uid.
 */

export const MAX_NO_DEVICE_NAME = 60;
export const MAX_NO_DEVICE_PER_TABLE = 5;

export function cleanNoDeviceName(value: unknown): string {
	const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
	if (name.length === 0 || name.length > MAX_NO_DEVICE_NAME) {
		throw new ClassroomError('invalid-argument', `name must be 1-${MAX_NO_DEVICE_NAME} characters`);
	}

	return name;
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
	const name = cleanNoDeviceName(req?.name);
	assertLessonRunning(await assertWorkspaceAdmin(firestore, mainId, actorUid));

	const ref = tableRef(firestore, classTableId(mainId, n));
	const member: NoDeviceMember = { id: `nd_${randomUUID()}`, name };
	await firestore.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		if (!snap.exists) throw new ClassroomError('not-found', `Table ${n} does not exist`);
		const table = snap.data() as ClassTable;
		const current = table.noDeviceMembers ?? [];
		if (current.length >= MAX_NO_DEVICE_PER_TABLE) {
			throw new ClassroomError(
				'resource-exhausted',
				'This table already has the most no-device members',
			);
		}
		tx.update(ref, { noDeviceMembers: [...current, member], updatedAt: Date.now() });
	});

	return { id: member.id };
}

export const classAddNoDevice = onCall(
	{ region: functionConfig.region },
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
