import type {
	ManageAccessRequest,
	ManageAccessResponse,
	RequestAccessRequest,
	RequestAccessResponse,
} from '@freedi/shared-types';
import { store } from './fakeFirestore';
import { agoraRequestAccess } from '../../fn_agoraRequestAccess';
import { agoraManageAccess } from '../../fn_agoraManageAccess';

/**
 * Shared world for the access-callable tests. Import it AFTER the test file's
 * jest.mock calls (they are hoisted, so any import order in the file works).
 */

export type Handler<Req, Res> = (request: {
	auth?: { uid: string; token: { firebase: { sign_in_provider: string } } };
	data: Req;
}) => Promise<Res>;

export const requestAccess = agoraRequestAccess as unknown as Handler<
	RequestAccessRequest,
	RequestAccessResponse
>;
export const manageAccess = agoraManageAccess as unknown as Handler<
	ManageAccessRequest,
	ManageAccessResponse
>;

export const ADMIN = 'admin';
export const COORD_A = 'coord-a';
export const COORD_NARROW = 'coord-narrow';
export const APPLICANT = 'applicant';
export const OTHER_APPLICANT = 'applicant-2';
export const TEACHER_A = 'teacher-a';
export const SCHOOL_A = 'school-a';
export const SCHOOL_B = 'school-b';

export function as<Req, Res>(
	handler: Handler<Req, Res>,
	uid: string,
	data: Req,
	provider = 'google.com',
): Promise<Res> {
	return handler({ auth: { uid, token: { firebase: { sign_in_provider: provider } } }, data });
}

export async function codeOf(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;

		return 'ok';
	} catch (error) {
		return (error as { code?: string }).code ?? 'unknown';
	}
}

export function school(id: string, extra: Record<string, unknown> = {}): void {
	store.set(`agoraSchools/${id}`, {
		schoolId: id,
		name: `School ${id}`,
		status: 'active',
		createdBy: ADMIN,
		classCount: 0,
		createdAt: 1,
		lastUpdate: 1,
		...extra,
	});
}

export function user(uid: string, extra: Record<string, unknown> = {}): void {
	store.set(`usersV2/${uid}`, { email: `${uid}@school.org`, displayName: `Name ${uid}`, ...extra });
}

export async function submitTeacher(uid: string, schoolId?: string): Promise<string> {
	const res = await as(requestAccess, uid, {
		action: 'submit',
		role: 'teacher',
		fullName: `Full ${uid}`,
		...(schoolId ? { schoolId } : { schoolNameText: 'Typed school', city: 'Haifa' }),
	});
	if (res.action !== 'submit') throw new Error('unexpected');

	return res.requestId;
}

export function requestDoc(requestId: string): Record<string, unknown> {
	return store.get(`agoraAccessRequests/${requestId}`) ?? {};
}

/**
 * An admin; school A with two coordinators (one narrowed to nobody) and one
 * attached teacher; an empty school B; two applicants.
 */
export function seedWorld(): void {
	store.clear();
	user(ADMIN, { systemAdmin: true });
	[COORD_A, COORD_NARROW, APPLICANT, OTHER_APPLICANT, TEACHER_A].forEach((uid) => user(uid));
	school(SCHOOL_A, {
		supervisorIds: [COORD_A, COORD_NARROW],
		supervisorMap: { [COORD_A]: true, [COORD_NARROW]: true },
		supervisorScopes: { [COORD_NARROW]: { teacherIds: [] } },
		teacherIds: [TEACHER_A],
		teacherMap: { [TEACHER_A]: true },
	});
	school(SCHOOL_B);
}
