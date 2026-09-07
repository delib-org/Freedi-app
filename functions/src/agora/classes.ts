/**
 * Opening and closing a class — shared by the sys-admin door
 * (`agoraAdminOpenClass`) and the teacher's own (`agoraTeacherClass`), so the
 * two can never mint a class differently. The pure guards live here too, so
 * the rules a class lives by are tested in node.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	getRandomUID,
	AgoraClass,
	AgoraSchool,
	AGORA_CLASSROOM,
} from '@freedi/shared-types';
import { generateUniqueClassCode } from './joinCodes';

/** A trimmed, length-capped label, or the refusal the caller should throw. */
export function cleanClassName(name: string | undefined, what: string): string {
	const trimmed = name?.trim() ?? '';
	if (!trimmed || trimmed.length > AGORA_CLASSROOM.MAX_NAME_LENGTH) {
		throw new HttpsError('invalid-argument', `A ${what} needs a name`);
	}

	return trimmed;
}

/** An optional grade, trimmed and capped; undefined when blank */
export function cleanGradeLevel(gradeLevel: string | undefined): string | undefined {
	const trimmed = gradeLevel?.trim() ?? '';
	if (!trimmed) return undefined;
	if (trimmed.length > AGORA_CLASSROOM.MAX_NAME_LENGTH) {
		throw new HttpsError('invalid-argument', 'The grade is too long');
	}

	return trimmed;
}

/** Is this uid one of the school's attached teachers? Absent maps read as empty. */
export function isSchoolTeacher(school: Pick<AgoraSchool, 'teacherMap'>, uid: string): boolean {
	return school.teacherMap?.[uid] === true;
}

/** Is this uid one of the class's teachers? */
export function isClassTeacher(agoraClass: Pick<AgoraClass, 'teacherMap'>, uid: string): boolean {
	return agoraClass.teacherMap[uid] === true;
}

/**
 * Which school a teacher's new class goes in. A requested school must be one
 * of theirs; with no request, one school means that one, several means the
 * teacher has to say, and none means the admin has not attached them yet.
 */
export function pickSchoolForTeacher(
	schools: ReadonlyArray<Pick<AgoraSchool, 'schoolId' | 'status'>>,
	requestedSchoolId: string | undefined,
): { ok: true; schoolId: string } | { ok: false; reason: 'none' | 'ambiguous' | 'not-yours' } {
	const active = schools.filter((school) => school.status === 'active');
	if (requestedSchoolId) {
		return active.some((school) => school.schoolId === requestedSchoolId)
			? { ok: true, schoolId: requestedSchoolId }
			: { ok: false, reason: 'not-yours' };
	}
	if (active.length === 0) return { ok: false, reason: 'none' };
	if (active.length > 1) return { ok: false, reason: 'ambiguous' };

	return { ok: true, schoolId: active[0].schoolId };
}

/** A class always keeps at least one teacher — the last one cannot leave. */
export function canRemoveTeacher(teacherIds: readonly string[], uid: string): boolean {
	return teacherIds.includes(uid) && teacherIds.length > 1;
}

export interface OpenClassInput {
	schoolId: string;
	/** Already cleaned */
	name: string;
	gradeLevel?: string;
	/** Who opened it — the sys-admin or the teacher */
	createdBy: string;
	teacherIds: string[];
}

/**
 * Mint a class under an active school: a unique class code, the teacher
 * index, the school's class count. Refuses an archived or missing school.
 */
export async function openClass(input: OpenClassInput): Promise<AgoraClass> {
	const schoolRef = db.collection(Collections.agoraSchools).doc(input.schoolId);
	const schoolSnap = await schoolRef.get();
	const school = schoolSnap.data() as AgoraSchool | undefined;
	if (!school || school.status !== 'active') {
		throw new HttpsError('failed-precondition', 'School not found or archived');
	}

	const classCode = await generateUniqueClassCode();
	const now = Date.now();
	const teacherMap: Record<string, boolean> = {};
	for (const uid of input.teacherIds) teacherMap[uid] = true;
	const agoraClass: AgoraClass = {
		classId: getRandomUID(),
		schoolId: input.schoolId,
		name: input.name,
		...(input.gradeLevel ? { gradeLevel: input.gradeLevel } : {}),
		teacherIds: [...input.teacherIds],
		teacherMap,
		classCode,
		memberCount: 0,
		status: 'active',
		createdBy: input.createdBy,
		createdAt: now,
		lastUpdate: now,
	};

	const batch = db.batch();
	batch.set(db.collection(Collections.agoraClasses).doc(agoraClass.classId), agoraClass);
	batch.update(schoolRef, { classCount: FieldValue.increment(1), lastUpdate: now });
	await batch.commit();

	return agoraClass;
}

/** Archive a class and give its seat back to the school's count. Idempotent. */
export async function archiveClass(agoraClass: AgoraClass): Promise<void> {
	const now = Date.now();
	const batch = db.batch();
	batch.update(db.collection(Collections.agoraClasses).doc(agoraClass.classId), {
		status: 'archived',
		lastUpdate: now,
	});
	if (agoraClass.status === 'active') {
		batch.update(db.collection(Collections.agoraSchools).doc(agoraClass.schoolId), {
			classCount: FieldValue.increment(-1),
			lastUpdate: now,
		});
	}
	await batch.commit();
}

/** Put a teacher on a class (arrayUnion + the equality index), in one write. */
export async function addClassTeacher(classId: string, teacherUid: string): Promise<void> {
	await db
		.collection(Collections.agoraClasses)
		.doc(classId)
		.update({
			teacherIds: FieldValue.arrayUnion(teacherUid),
			[`teacherMap.${teacherUid}`]: true,
			lastUpdate: Date.now(),
		});
}

/** Take a teacher off a class — both halves of the index together. */
export async function removeClassTeacher(classId: string, teacherUid: string): Promise<void> {
	await db
		.collection(Collections.agoraClasses)
		.doc(classId)
		.update({
			teacherIds: FieldValue.arrayRemove(teacherUid),
			[`teacherMap.${teacherUid}`]: FieldValue.delete(),
			lastUpdate: Date.now(),
		});
}
