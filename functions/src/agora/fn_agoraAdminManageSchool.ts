import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	functionConfig,
	getRandomUID,
	AgoraSchool,
	AGORA_CLASSROOM,
	ManageSchoolRequest,
	ManageSchoolResponse,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';

/**
 * Sys-admin school management. Clients cannot write `agoraSchools` at all
 * (rules) — this callable is the only door, and it opens only for
 * usersV2/{uid}.systemAdmin.
 */
export const agoraAdminManageSchool = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ManageSchoolRequest>): Promise<ManageSchoolResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (!(await isSystemAdmin(uid))) {
			throw new HttpsError('permission-denied', 'System admin required');
		}

		const { action, schoolId, name, city } = request.data ?? {};

		try {
			if (action === 'create') {
				const trimmed = name?.trim();
				if (!trimmed || trimmed.length > AGORA_CLASSROOM.MAX_NAME_LENGTH) {
					throw new HttpsError('invalid-argument', 'A school needs a name');
				}
				const now = Date.now();
				const school: AgoraSchool = {
					schoolId: getRandomUID(),
					name: trimmed,
					...(city?.trim() ? { city: city.trim() } : {}),
					status: 'active',
					createdBy: uid,
					classCount: 0,
					createdAt: now,
					lastUpdate: now,
				};
				await db.collection(Collections.agoraSchools).doc(school.schoolId).set(school);

				return { schoolId: school.schoolId };
			}

			if (!schoolId || typeof schoolId !== 'string') {
				throw new HttpsError('invalid-argument', 'schoolId is required');
			}
			const schoolRef = db.collection(Collections.agoraSchools).doc(schoolId);
			const schoolSnap = await schoolRef.get();
			if (!schoolSnap.exists) {
				throw new HttpsError('not-found', 'School not found');
			}

			if (action === 'rename') {
				const trimmed = name?.trim();
				if (!trimmed || trimmed.length > AGORA_CLASSROOM.MAX_NAME_LENGTH) {
					throw new HttpsError('invalid-argument', 'A school needs a name');
				}
				await schoolRef.update({
					name: trimmed,
					...(city !== undefined ? { city: city.trim() } : {}),
					lastUpdate: Date.now(),
				});

				return { schoolId };
			}

			if (action === 'archive') {
				await schoolRef.update({ status: 'archived', lastUpdate: Date.now() });

				return { schoolId };
			}

			throw new HttpsError('invalid-argument', 'Unknown action');
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.adminManageSchool',
				userId: uid,
				metadata: { action, schoolId },
			});
			throw new HttpsError('internal', 'Failed to manage school');
		}
	},
);
