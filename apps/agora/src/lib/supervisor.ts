import type {
	SupervisorConsoleRequest,
	SupervisorConsoleResponse,
	SupervisorOverview,
	SupervisorTeacherDetail,
	SupervisorClassDetail,
	SupervisorStudentDetail,
	SupervisorSystemView,
} from '@freedi/shared-types';
import { functions, httpsCallable } from './firebase';

export type ConsoleResult<R extends SupervisorConsoleRequest> = R extends { view: 'overview' }
	? SupervisorOverview
	: R extends { view: 'teacher' }
		? SupervisorTeacherDetail
		: R extends { view: 'class' }
			? SupervisorClassDetail
			: R extends { view: 'student' }
				? SupervisorStudentDetail
				: SupervisorSystemView;
export async function supervisorConsole<R extends SupervisorConsoleRequest>(
	request: R,
): Promise<ConsoleResult<R>> {
	const result = await httpsCallable<SupervisorConsoleRequest, SupervisorConsoleResponse>(
		functions,
		'agoraSupervisorConsole',
	)(request);

	return result.data as ConsoleResult<R>;
}
export function savedScope(uid: string): string {
	try {
		return localStorage.getItem(`agora_supervise_scope:${uid}`) ?? '';
	} catch {
		return '';
	}
}
export function saveScope(uid: string, school: string): void {
	try {
		localStorage.setItem(`agora_supervise_scope:${uid}`, school);
	} catch {
		/* Storage is optional. */
	}
}
