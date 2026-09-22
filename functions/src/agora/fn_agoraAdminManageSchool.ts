import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	functionConfig,
	getRandomUID,
	AgoraClass,
	AgoraSchool,
	AGORA_CLASSROOM,
	ManageSchoolRequest,
	ManageSchoolResponse,
	schoolTeacherUids,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';
import { resolveTeacherUid } from './teacherLookup';

/** The most teachers one supervisor's narrowing may name */
const MAX_SCOPE_TEACHERS = 200;

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

		const { action, schoolId, name, city, teacherEmail, supervisorEmail, teacherIds } =
			request.data ?? {};

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

			// The school's teachers: the ones who may open classes in it themselves.
			// Both halves of the index move in one write, as on a class.
			if (action === 'assignTeacher') {
				const teacherUid = await resolveTeacherUid(teacherEmail ?? '');
				await schoolRef.update({
					teacherIds: FieldValue.arrayUnion(teacherUid),
					[`teacherMap.${teacherUid}`]: true,
					lastUpdate: Date.now(),
				});

				return { schoolId, teacherUid };
			}

			if (action === 'removeTeacher') {
				const teacherUid = await resolveTeacherUid(teacherEmail ?? '');
				await schoolRef.update({
					teacherIds: FieldValue.arrayRemove(teacherUid),
					[`teacherMap.${teacherUid}`]: FieldValue.delete(),
					lastUpdate: Date.now(),
				});

				return { schoolId, teacherUid };
			}

			// The school's supervisors: the ones who may read its teachers' lessons
			// and hours through agoraSupervisorConsole. Same two-halves index as
			// the teachers above, plus an optional per-supervisor narrowing.
			if (action === 'assignSupervisor') {
				const supervisorUid = await resolveTeacherUid(supervisorEmail ?? '');
				await schoolRef.update({
					supervisorIds: FieldValue.arrayUnion(supervisorUid),
					[`supervisorMap.${supervisorUid}`]: true,
					lastUpdate: Date.now(),
				});

				return { schoolId, supervisorUid };
			}

			if (action === 'removeSupervisor') {
				const supervisorUid = await resolveTeacherUid(supervisorEmail ?? '');
				// The attachment, its index and its narrowing leave in ONE write —
				// a scope left behind would silently re-narrow a re-assigned supervisor.
				await schoolRef.update({
					supervisorIds: FieldValue.arrayRemove(supervisorUid),
					[`supervisorMap.${supervisorUid}`]: FieldValue.delete(),
					[`supervisorScopes.${supervisorUid}`]: FieldValue.delete(),
					lastUpdate: Date.now(),
				});

				return { schoolId, supervisorUid };
			}

			if (action === 'setSupervisorScope') {
				const supervisorUid = await resolveTeacherUid(supervisorEmail ?? '');
				const school = schoolSnap.data() as AgoraSchool;
				if (school.supervisorMap?.[supervisorUid] !== true) {
					throw new HttpsError(
						'failed-precondition',
						'Assign the supervisor to the school before narrowing their scope',
					);
				}
				if (teacherIds === null || teacherIds === undefined) {
					await schoolRef.update({
						[`supervisorScopes.${supervisorUid}`]: FieldValue.delete(),
						lastUpdate: Date.now(),
					});

					return { schoolId, supervisorUid };
				}
				if (
					!Array.isArray(teacherIds) ||
					teacherIds.some((id) => typeof id !== 'string' || !id) ||
					teacherIds.length > MAX_SCOPE_TEACHERS
				) {
					throw new HttpsError('invalid-argument', 'teacherIds must be a list of uids');
				}
				// Only teachers the school actually has — attached to it or on one
				// of its classes — may be named; a stray uid is a typo, not a scope.
				const classSnaps = await db
					.collection(Collections.agoraClasses)
					.where('schoolId', '==', schoolId)
					.get();
				const known = new Set(
					schoolTeacherUids(
						school,
						classSnaps.docs.map((snap) => snap.data() as AgoraClass),
					),
				);
				const unknown = teacherIds.filter((id) => !known.has(id));
				if (unknown.length) {
					throw new HttpsError(
						'invalid-argument',
						`Not teachers of this school: ${unknown.join(', ')}`,
					);
				}
				await schoolRef.update({
					[`supervisorScopes.${supervisorUid}`]: { teacherIds: [...new Set(teacherIds)] },
					lastUpdate: Date.now(),
				});

				return { schoolId, supervisorUid };
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
