import { Collections } from '@freedi/shared-types';
import { collection, db, getDocs, query, where } from './firebase';

/**
 * The teacher's classes: Studio's `agoraClasses` where `teacherMap.<uid> == true`
 * (docs/ia/join-class-lesson-plan.md 5). The rules let a teacher read exactly
 * those, and only prove it from this equality constraint, so the query must be
 * written this way. Archived classes are not offered (decision 9).
 */

export interface TeacherClass {
	classId: string;
	name: string;
}

interface ClassDoc {
	name?: unknown;
	status?: unknown;
}

/** Active classes of this teacher by name. Throws when the read fails (the form shows "try again"). */
export async function loadTeacherClasses(uid: string): Promise<TeacherClass[]> {
	const snap = await getDocs(
		query(collection(db, Collections.agoraClasses), where(`teacherMap.${uid}`, '==', true)),
	);

	return snap.docs
		.map((d) => ({ id: d.id, data: d.data() as ClassDoc }))
		.filter(({ data }) => data.status !== 'archived' && typeof data.name === 'string')
		.map(({ id, data }): TeacherClass => ({ classId: id, name: String(data.name) }))
		.sort((a, b) => a.name.localeCompare(b.name));
}
