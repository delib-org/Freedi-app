import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	functionConfig,
	AgoraClass,
	OpenClassRequest,
	OpenClassResponse,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';
import {
	addClassTeacher,
	archiveClass,
	cleanClassName,
	cleanGradeLevel,
	openClass,
	removeClassTeacher,
} from './classes';
import { resolveTeacherUid } from './teacherLookup';

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
				const trimmed = cleanClassName(name, 'class');
				// An assigned teacher at creation is optional — a class can be opened
				// first and staffed later.
				const teacherUid = teacherEmail ? await resolveTeacherUid(teacherEmail) : undefined;
				const agoraClass = await openClass({
					schoolId,
					name: trimmed,
					...(cleanGradeLevel(gradeLevel) ? { gradeLevel: cleanGradeLevel(gradeLevel) } : {}),
					createdBy: uid,
					teacherIds: teacherUid ? [teacherUid] : [],
				});

				return {
					classId: agoraClass.classId,
					classCode: agoraClass.classCode,
					...(teacherUid ? { teacherUid } : {}),
				};
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
					await addClassTeacher(classId, teacherUid);

					return { classId, teacherUid };
				}
				case 'removeTeacher': {
					const teacherUid = await resolveTeacherUid(teacherEmail ?? '');
					await removeClassTeacher(classId, teacherUid);

					return { classId, teacherUid };
				}
				case 'rename': {
					const trimmed = cleanClassName(name, 'class');
					await classRef.update({
						name: trimmed,
						...(gradeLevel !== undefined ? { gradeLevel: cleanGradeLevel(gradeLevel) ?? '' } : {}),
						lastUpdate: Date.now(),
					});

					return { classId };
				}
				case 'archive': {
					await archiveClass(agoraClass);

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
