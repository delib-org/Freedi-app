import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type {
	ClassCloseRegistrationRequest,
	ClassCloseRegistrationResponse,
} from '@freedi/shared-types';
import { db } from '../../db';
import { setStatus } from '../../tableAssignment/fn_tablesSetStatus';
import { TablesError } from '../../tableAssignment/tablesErrors';
import { assertWorkspaceAdmin, requireId, requireUid } from '../classroomAccess';
import { ClassroomError, toHttpsError } from '../classroomErrors';
import { loadConnectedLesson } from './registrationAccess';

/**
 * `classCloseRegistration` (admin of a connected lesson): closes the
 * registration from Class (Tal, 2026-11-15) through the very function Tables
 * uses, `tablesSetStatus`, which checks that the caller hosts it. A "sit where
 * you like" registration is published in the same press.
 */
export async function closeRegistration(
	firestore: Firestore,
	uid: string,
	req: ClassCloseRegistrationRequest,
	now: number = Date.now(),
): Promise<ClassCloseRegistrationResponse> {
	const mainId = requireId(req?.mainId, 'mainId');
	await assertWorkspaceAdmin(firestore, mainId, uid);
	const { session } = await loadConnectedLesson(firestore, mainId);
	try {
		return await setStatus(
			firestore,
			uid,
			{ sessionId: session.tableAssignmentId, status: 'registrationClosed' },
			now,
		);
	} catch (error) {
		// The Tables refusal, as the Class client knows refusals.
		if (error instanceof TablesError) throw new ClassroomError(error.code, error.message);
		throw error;
	}
}

export const classCloseRegistration = onCall(
	{ region: functionConfig.region, timeoutSeconds: 120 },
	async (
		request: CallableRequest<ClassCloseRegistrationRequest>,
	): Promise<ClassCloseRegistrationResponse> => {
		let uid: string | undefined;
		try {
			uid = requireUid(request);

			return await closeRegistration(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'classroom.classCloseRegistration',
				userId: uid,
				statementId: request.data?.mainId,
			});
		}
	},
);
