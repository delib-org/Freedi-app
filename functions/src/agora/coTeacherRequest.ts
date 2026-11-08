import { AGORA_ACCESS } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { resolveApproval } from './libraryAccess';
import { applicantInfo, fileAccessRequest, schoolsById } from './accessRequests';
import { sendNewRequestEmails } from './accessEmail';

/**
 * A class teacher added a co-teacher by email (`agoraTeacherClass addTeacher`).
 * Any teacher can do that, so it proves nothing about the co-teacher: when
 * they are not approved, a pending request (`source: 'coTeacher'`) is filed at
 * the class's school so its coordinators can approve them. Until then the
 * co-teacher sees the class but cannot run it (the server gates do).
 *
 * Best effort: the add already happened and stays; a failure here is logged.
 * Resolves `true` when a new request was filed.
 */
export async function requestAccessForCoTeacher(
	teacherUid: string,
	schoolId: string,
	addedBy: string,
): Promise<boolean> {
	try {
		if ((await resolveApproval(teacherUid)).approved) return false;
		const [people, schools] = await Promise.all([
			applicantInfo([teacherUid]),
			schoolsById([schoolId]),
		]);
		const school = schools.get(schoolId);
		const activeSchool = school?.status === 'active' ? school : undefined;
		const fullName = (people.get(teacherUid)?.displayName ?? '')
			.trim()
			.slice(0, AGORA_ACCESS.MAX_NAME_LENGTH);
		const filed = await fileAccessRequest({
			uid: teacherUid,
			role: 'teacher',
			fullName,
			source: 'coTeacher',
			...(activeSchool ? { schoolId } : {}),
			addedBy,
		});
		if (filed.created && activeSchool) {
			await sendNewRequestEmails(
				filed.request,
				activeSchool.name,
				Object.keys(activeSchool.supervisorMap ?? {}),
			);
		}

		return filed.created;
	} catch (error) {
		logError(error, {
			operation: 'agora.requestAccessForCoTeacher',
			userId: addedBy,
			metadata: { teacherUid, schoolId },
		});

		return false;
	}
}
