import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { classTableId, functionConfig } from '@freedi/shared-types';
import type {
	ClassMoveStudentRequest,
	ClassMoveStudentResponse,
	ClassTable,
	StatementSubscription,
} from '@freedi/shared-types';
import { db } from '../db';
import {
	assertWorkspaceAdmin,
	requireId,
	requireUid,
	subscriptionRef,
	tableRef,
} from './classroomAccess';
import { ClassroomError, toHttpsError } from './classroomErrors';
import { assertLessonRunning, lessonStepOf } from './lessonStatusGuard';
import { addMember, removeMember } from './tableMembership';

/**
 * `classMoveStudent` (admin): move one student to table `toTable` (1-based)
 * or unseat them (`null`). Old table, new table and the student's
 * subscription.tableId change together in one transaction; an asker who
 * leaves hands the asker role to the next tablemate.
 */

const MAX_TABLE_NUMBER = 100;

function validTarget(value: unknown): number | null {
	if (value === null) return null;
	if (
		typeof value !== 'number' ||
		!Number.isInteger(value) ||
		value < 1 ||
		value > MAX_TABLE_NUMBER
	) {
		throw new ClassroomError('invalid-argument', 'toTable must be a table number or null');
	}

	return value;
}

export async function moveStudent(
	firestore: Firestore,
	actorUid: string,
	req: ClassMoveStudentRequest,
): Promise<ClassMoveStudentResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	const uid = requireId(req?.uid, 'uid');
	const toTable = validTarget(req?.toTable);
	const main = await assertWorkspaceAdmin(firestore, mainId, actorUid);
	assertLessonRunning(main);
	const lessonStep = lessonStepOf(main);

	const subRef = subscriptionRef(firestore, mainId, uid);
	await firestore.runTransaction(async (tx) => {
		const subSnap = await tx.get(subRef);
		if (!subSnap.exists)
			throw new ClassroomError('not-found', 'This student has not joined the lesson');
		const sub = subSnap.data() as StatementSubscription;

		const fromId = sub.tableId;
		const toId = toTable === null ? null : classTableId(mainId, toTable);
		if (fromId === toId) return;

		const fromRef = fromId ? tableRef(firestore, fromId) : null;
		const toRef = toId ? tableRef(firestore, toId) : null;
		const [fromSnap, toSnap] = await Promise.all([
			fromRef ? tx.get(fromRef) : Promise.resolve(null),
			toRef ? tx.get(toRef) : Promise.resolve(null),
		]);
		if (toRef && !toSnap?.exists)
			throw new ClassroomError('not-found', `Table ${toTable} does not exist`);
		const toTableDoc = toSnap?.exists ? (toSnap.data() as ClassTable) : null;
		if (toTableDoc && toTableDoc.mainId !== mainId) {
			throw new ClassroomError('permission-denied', 'That table belongs to another lesson');
		}

		const now = Date.now();
		if (fromRef && fromSnap?.exists) {
			const fromTable = fromSnap.data() as ClassTable;
			if (fromTable.mainId === mainId)
				tx.set(fromRef, removeMember(fromTable, uid, now, lessonStep));
		}
		if (toRef && toTableDoc) tx.set(toRef, addMember(toTableDoc, uid, now));
		tx.update(subRef, { tableId: toId ?? FieldValue.delete(), lastUpdate: now });
	});

	return { ok: true };
}

export const classMoveStudent = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ClassMoveStudentRequest>): Promise<ClassMoveStudentResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await moveStudent(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classMoveStudent',
				userId: uid,
				statementId: request.data?.mainId,
				metadata: { student: request.data?.uid, toTable: request.data?.toTable },
			});
		}
	},
);
