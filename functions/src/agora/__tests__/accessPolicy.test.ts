import { describe, it, expect } from '@jest/globals';
import {
	AgoraAccessActor,
	AgoraAccessRequest,
	canDecideAccessRequest,
	canRemoveAccess,
	canSeeAccessRequest,
} from '@freedi/shared-types';

/** The approval rule of IA spec §9, as the pure functions Studio and the callables share */

const admin: AgoraAccessActor = { uid: 'admin', isAdmin: true, supervisedSchoolIds: new Set() };
const coord: AgoraAccessActor = {
	uid: 'coord',
	isAdmin: false,
	supervisedSchoolIds: new Set(['s1']),
};
const teacher: AgoraAccessActor = {
	uid: 'teacher',
	isAdmin: false,
	supervisedSchoolIds: new Set(),
};

type Req = Pick<AgoraAccessRequest, 'uid' | 'role' | 'schoolId' | 'status'>;
const req = (over: Partial<Req> = {}): Req => ({
	uid: 'applicant',
	role: 'teacher',
	schoolId: 's1',
	status: 'pending',
	...over,
});

describe('canDecideAccessRequest', () => {
	it.each<[string, AgoraAccessActor, Req, boolean]>([
		['admin: teacher request', admin, req(), true],
		['admin: coordinator request', admin, req({ role: 'supervisor' }), true],
		['admin: school-less request', admin, req({ schoolId: undefined }), true],
		['coordinator: teacher at own school', coord, req(), true],
		['coordinator: teacher at another school', coord, req({ schoolId: 's2' }), false],
		['coordinator: school-less teacher request', coord, req({ schoolId: undefined }), false],
		['coordinator: coordinator request at own school', coord, req({ role: 'supervisor' }), false],
		['coordinator: own request', coord, req({ uid: 'coord' }), false],
		['teacher: anything', teacher, req(), false],
		['admin: already decided', admin, req({ status: 'approved' }), false],
		['coordinator: withdrawn', coord, req({ status: 'withdrawn' }), false],
	])('%s', (_label, actor, request, expected) => {
		expect(canDecideAccessRequest(actor, request)).toBe(expected);
	});
});

describe('canSeeAccessRequest', () => {
	it('lets applicants see their own, coordinators their schools’ teacher requests, admins all', () => {
		expect(canSeeAccessRequest(teacher, req({ uid: 'teacher' }))).toBe(true);
		expect(canSeeAccessRequest(teacher, req())).toBe(false);
		expect(canSeeAccessRequest(coord, req({ status: 'declined' }))).toBe(true);
		expect(canSeeAccessRequest(coord, req({ role: 'supervisor' }))).toBe(false);
		expect(canSeeAccessRequest(coord, req({ schoolId: 's2' }))).toBe(false);
		expect(canSeeAccessRequest(admin, req({ role: 'supervisor', schoolId: undefined }))).toBe(true);
	});
});

describe('canRemoveAccess', () => {
	it('admins remove anyone anywhere; coordinators teachers in scope at their schools only', () => {
		expect(canRemoveAccess(admin, { uid: 'x', role: 'supervisor' }, false)).toBe(true);
		expect(canRemoveAccess(coord, { uid: 'x', role: 'teacher', schoolId: 's1' }, true)).toBe(true);
		expect(canRemoveAccess(coord, { uid: 'x', role: 'teacher', schoolId: 's1' }, false)).toBe(
			false,
		);
		expect(canRemoveAccess(coord, { uid: 'x', role: 'teacher', schoolId: 's2' }, true)).toBe(false);
		expect(canRemoveAccess(coord, { uid: 'x', role: 'supervisor', schoolId: 's1' }, true)).toBe(
			false,
		);
		expect(canRemoveAccess(coord, { uid: 'x', role: 'teacher' }, true)).toBe(false);
		expect(canRemoveAccess(coord, { uid: 'coord', role: 'teacher', schoolId: 's1' }, true)).toBe(
			false,
		);
		expect(canRemoveAccess(teacher, { uid: 'x', role: 'teacher', schoolId: 's1' }, true)).toBe(
			false,
		);
	});
});
