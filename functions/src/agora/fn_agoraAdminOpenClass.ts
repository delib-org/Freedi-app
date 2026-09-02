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
	OpenClassRequest,
	OpenClassResponse,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';
import { generateUniqueClassCode } from './joinCodes';

/**
 * Resolve a teacher's sign-in email to a uid. Server-side only — the client
 * never queries usersV2 by email, and the email itself is never written into
 * any agora document.
 */
async function resolveTeacherUid(teacherEmail: string): Promise<string> {
	const email = teacherEmail.trim().toLowerCase();
	if (!email) {
		throw new HttpsError('invalid-argument', 'teacherEmail is required');
	}
	const snap = await db.collection(Collections.users).where('email', '==', email).limit(1).get();
	if (snap.empty) {
		throw new HttpsError(
			'not-found',
			'No account with that email — the teacher must sign in to Agora with Google once first',
		);
	}

	return snap.docs[0].id;
}

/**
 * Sys-admin class management: open a class under a school, assign or remove
 * its teachers, rename, archive. Clients cannot write `agoraClasses` (rules)
 * — this callable is the only door.
 */
export const agoraAdminOpenClass = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<OpenClassRequest>): Promise<OpenClassResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (!(await isSystemAdmin(uid))) {
			throw new HttpsError('permission-denied', 'System admin required');
		}

		const { action, schoolId, classId, name, gradeLevel, teacherEmail } = request.data ?? {};

		try {
			if (action === 'create') {
				if (!schoolId || typeof schoolId !== 'string') {
					throw new HttpsError('invalid-argument', 'schoolId is required');
				}
				const trimmed = name?.trim();
				if (!trimmed || trimmed.length > AGORA_CLASSROOM.MAX_NAME_LENGTH) {
					throw new HttpsError('invalid-argument', 'A class needs a name');
				}
				const schoolRef = db.collection(Collections.agoraSchools).doc(schoolId);
				const schoolSnap = await schoolRef.get();
				const school = schoolSnap.data() as AgoraSchool | undefined;
				if (!school || school.status !== 'active') {
					throw new HttpsError('failed-precondition', 'School not found or archived');
				}

				// An assigned teacher at creation is optional — a class can be opened
				// first and staffed later.
				const teacherUid = teacherEmail ? await resolveTeacherUid(teacherEmail) : undefined;

				const classCode = await generateUniqueClassCode();
				const now = Date.now();
				const agoraClass: AgoraClass = {
					classId: getRandomUID(),
					schoolId,
					name: trimmed,
					...(gradeLevel?.trim() ? { gradeLevel: gradeLevel.trim() } : {}),
					teacherIds: teacherUid ? [teacherUid] : [],
					teacherMap: teacherUid ? { [teacherUid]: true } : {},
					classCode,
					memberCount: 0,
					status: 'active',
					createdBy: uid,
					createdAt: now,
					lastUpdate: now,
				};

				const batch = db.batch();
				batch.set(db.collection(Collections.agoraClasses).doc(agoraClass.classId), agoraClass);
				batch.update(schoolRef, { classCount: FieldValue.increment(1), lastUpdate: now });
				await batch.commit();

				return { classId: agoraClass.classId, classCode, ...(teacherUid ? { teacherUid } : {}) };
			}

			if (!classId || typeof classId !== 'string') {
				throw new HttpsError('invalid-argument', 'classId is required');
			}
			const classRef = db.collection(Collections.agoraClasses).doc(classId);
			const classSnap = await classRef.get();
			const agoraClass = classSnap.data() as AgoraClass | undefined;
			if (!agoraClass) {
				throw new HttpsError('not-found', 'Class not found');
			}

			switch (action) {
				case 'assignTeacher': {
					const teacherUid = await resolveTeacherUid(teacherEmail ?? '');
					await classRef.update({
						teacherIds: FieldValue.arrayUnion(teacherUid),
						[`teacherMap.${teacherUid}`]: true,
						lastUpdate: Date.now(),
					});

					return { classId, teacherUid };
				}
				case 'removeTeacher': {
					const teacherUid = await resolveTeacherUid(teacherEmail ?? '');
					await classRef.update({
						teacherIds: FieldValue.arrayRemove(teacherUid),
						[`teacherMap.${teacherUid}`]: FieldValue.delete(),
						lastUpdate: Date.now(),
					});

					return { classId, teacherUid };
				}
				case 'rename': {
					const trimmed = name?.trim();
					if (!trimmed || trimmed.length > AGORA_CLASSROOM.MAX_NAME_LENGTH) {
						throw new HttpsError('invalid-argument', 'A class needs a name');
					}
					await classRef.update({
						name: trimmed,
						...(gradeLevel !== undefined ? { gradeLevel: gradeLevel.trim() } : {}),
						lastUpdate: Date.now(),
					});

					return { classId };
				}
				case 'archive': {
					const now = Date.now();
					const batch = db.batch();
					batch.update(classRef, { status: 'archived', lastUpdate: now });
					if (agoraClass.status === 'active') {
						batch.update(db.collection(Collections.agoraSchools).doc(agoraClass.schoolId), {
							classCount: FieldValue.increment(-1),
							lastUpdate: now,
						});
					}
					await batch.commit();

					return { classId };
				}
				default:
					throw new HttpsError('invalid-argument', 'Unknown action');
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.adminOpenClass',
				userId: uid,
				metadata: { action, schoolId, classId },
			});
			throw new HttpsError('internal', 'Failed to manage class');
		}
	},
);
