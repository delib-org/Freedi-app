import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	functionConfig,
	AgoraClass,
	AgoraSchool,
	TeacherClassRequest,
	TeacherClassResponse,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import {
	addClassTeacher,
	archiveClass,
	canRemoveTeacher,
	cleanClassName,
	cleanGradeLevel,
	isClassTeacher,
	openClass,
	pickSchoolForTeacher,
	removeClassTeacher,
} from './classes';
import { resolveTeacherUid } from './teacherLookup';

/**
 * A teacher's own classes. The admin opens the school and attaches its
 * teachers; from then on a teacher opens classes in it without anyone's help,
 * and the class's teachers rename it, archive it, and bring in co-teachers.
 * Clients cannot write `agoraClasses` (rules) — this is the teacher's door,
 * `agoraAdminOpenClass` the admin's, and both mint a class through `classes.ts`.
 */
export const agoraTeacherClass = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<TeacherClassRequest>): Promise<TeacherClassResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Teachers must sign in with a full account');
		}

		const data = request.data ?? ({} as TeacherClassRequest);

		try {
			if (data.action === 'create') {
				const name = cleanClassName(data.name, 'class');
				const gradeLevel = cleanGradeLevel(data.gradeLevel);
				const schoolSnaps = await db
					.collection(Collections.agoraSchools)
					.where(`teacherMap.${uid}`, '==', true)
					.get();
				const schools = schoolSnaps.docs.map((snap) => snap.data() as AgoraSchool);
				const picked = pickSchoolForTeacher(schools, data.schoolId);
				if (!picked.ok) {
					if (picked.reason === 'ambiguous') {
						throw new HttpsError('invalid-argument', 'schoolId is required');
					}
					throw new HttpsError(
						'permission-denied',
						'Your admin has to attach you to a school before you can open a class',
					);
				}

				const agoraClass = await openClass({
					schoolId: picked.schoolId,
					name,
					...(gradeLevel ? { gradeLevel } : {}),
					createdBy: uid,
					teacherIds: [uid],
				});

				return { classId: agoraClass.classId, classCode: agoraClass.classCode };
			}

			const classId = 'classId' in data ? data.classId : '';
			if (!classId || typeof classId !== 'string') {
				throw new HttpsError('invalid-argument', 'classId is required');
			}
			const classRef = db.collection(Collections.agoraClasses).doc(classId);
			const agoraClass = (await classRef.get()).data() as AgoraClass | undefined;
			if (!agoraClass) {
				throw new HttpsError('not-found', 'Class not found');
			}
			if (!isClassTeacher(agoraClass, uid)) {
				throw new HttpsError('permission-denied', 'Only a teacher of this class may change it');
			}

			switch (data.action) {
				case 'rename': {
					const name = cleanClassName(data.name, 'class');
					const gradeLevel = cleanGradeLevel(data.gradeLevel);
					await classRef.update({
						name,
						...(data.gradeLevel !== undefined ? { gradeLevel: gradeLevel ?? '' } : {}),
						lastUpdate: Date.now(),
					});

					return { classId };
				}
				case 'archive': {
					await archiveClass(agoraClass);

					return { classId };
				}
				case 'addTeacher': {
					const teacherUid = await resolveTeacherUid(data.teacherEmail ?? '');
					await addClassTeacher(classId, teacherUid);

					return { classId, teacherUid };
				}
				case 'removeTeacher': {
					const teacherUid = typeof data.teacherUid === 'string' ? data.teacherUid : '';
					if (!teacherUid) {
						throw new HttpsError('invalid-argument', 'teacherUid is required');
					}
					if (!canRemoveTeacher(agoraClass.teacherIds, teacherUid)) {
						throw new HttpsError(
							'failed-precondition',
							'A class keeps at least one teacher — add another before leaving',
						);
					}
					await removeClassTeacher(classId, teacherUid);

					return { classId, teacherUid };
				}
				default:
					throw new HttpsError('invalid-argument', 'Unknown action');
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.teacherClass',
				userId: uid,
				metadata: { action: data.action },
			});
			throw new HttpsError('internal', 'Failed to manage class');
		}
	},
);
