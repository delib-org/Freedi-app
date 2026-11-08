import { describe, expect, it } from 'vitest';
import {
	canDecideAccessRequest,
	canRemoveAccess,
	canSeeAccessRequest,
	type AccessRequestRow,
} from '@freedi/shared-types';
import {
	actorFromList,
	applicantName,
	canSubmitSchools,
	filterRequests,
	schoolLabel,
	sortRequests,
} from '../accessModel';
import { signUpUrl } from '../SignUpLink';

function row(over: Partial<AccessRequestRow>): AccessRequestRow {
	return {
		requestId: 'r1',
		uid: 'applicant',
		role: 'teacher',
		fullName: 'Dana Levi',
		schoolId: 's1',
		source: 'link',
		status: 'pending',
		createdAt: 100,
		lastUpdate: 100,
		...over,
	};
}

describe('actorFromList', () => {
	it('an admin has no school list of their own: the policy lets them decide anything', () => {
		const actor = actorFromList('admin1', true, [{ schoolId: 's1', name: 'A' }]);
		expect(actor.supervisedSchoolIds.size).toBe(0);
		expect(canDecideAccessRequest(actor, row({}))).toBe(true);
		expect(canDecideAccessRequest(actor, row({ role: 'supervisor', schoolId: undefined }))).toBe(
			true,
		);
	});

	it('a coordinator decides teacher requests at their schools only', () => {
		const actor = actorFromList('coord1', false, [{ schoolId: 's1', name: 'A' }]);
		expect(canDecideAccessRequest(actor, row({ schoolId: 's1' }))).toBe(true);
		expect(canDecideAccessRequest(actor, row({ schoolId: 's2' }))).toBe(false);
		expect(canDecideAccessRequest(actor, row({ role: 'supervisor', schoolId: 's1' }))).toBe(false);
		expect(canDecideAccessRequest(actor, row({ schoolId: undefined }))).toBe(false);
	});

	it('nobody decides their own request or one that is already decided', () => {
		const coordinator = actorFromList('coord1', false, [{ schoolId: 's1', name: 'A' }]);
		expect(canDecideAccessRequest(coordinator, row({ uid: 'coord1' }))).toBe(false);
		expect(canDecideAccessRequest(coordinator, row({ status: 'approved' }))).toBe(false);
	});

	it('a coordinator does not even see coordinator requests', () => {
		const actor = actorFromList('coord1', false, [{ schoolId: 's1', name: 'A' }]);
		expect(canSeeAccessRequest(actor, row({ role: 'supervisor' }))).toBe(false);
		expect(canSeeAccessRequest(actor, row({ schoolId: 's1' }))).toBe(true);
	});
});

describe('remove access visibility', () => {
	const admin = actorFromList('admin1', true, []);
	const coordinator = actorFromList('coord1', false, [{ schoolId: 's1', name: 'A' }]);

	it('admins remove anyone, coordinators included', () => {
		expect(canRemoveAccess(admin, { uid: 'u', role: 'supervisor', schoolId: 's1' }, true)).toBe(
			true,
		);
		expect(canRemoveAccess(admin, { uid: 'u', role: 'teacher', schoolId: 's9' }, true)).toBe(true);
	});

	it('coordinators remove teachers of their own schools only', () => {
		expect(canRemoveAccess(coordinator, { uid: 'u', role: 'teacher', schoolId: 's1' }, true)).toBe(
			true,
		);
		expect(canRemoveAccess(coordinator, { uid: 'u', role: 'teacher', schoolId: 's2' }, true)).toBe(
			false,
		);
		expect(
			canRemoveAccess(coordinator, { uid: 'u', role: 'supervisor', schoolId: 's1' }, true),
		).toBe(false);
		expect(
			canRemoveAccess(coordinator, { uid: 'coord1', role: 'teacher', schoolId: 's1' }, true),
		).toBe(false);
	});
});

describe('sortRequests', () => {
	const rows = [
		row({ requestId: 'late', createdAt: 300, decidedAt: 900 }),
		row({ requestId: 'early', createdAt: 100, decidedAt: 500 }),
	];

	it('puts the oldest pending request first', () => {
		expect(sortRequests(rows, 'pending').map((r) => r.requestId)).toEqual(['early', 'late']);
	});

	it('puts the newest decision first once decided', () => {
		expect(sortRequests(rows, 'approved').map((r) => r.requestId)).toEqual(['late', 'early']);
	});

	it('does not mutate its input', () => {
		const input = [...rows];
		sortRequests(input, 'pending');
		expect(input.map((r) => r.requestId)).toEqual(['late', 'early']);
	});
});

describe('filterRequests', () => {
	const rows = [
		row({ requestId: 'a', fullName: 'Dana Levi', applicantEmail: 'dana@school.org' }),
		row({
			requestId: 'b',
			fullName: 'Omer Cohen',
			role: 'supervisor',
			applicantEmail: 'omer@x.org',
		}),
	];

	it('filters by role', () => {
		expect(
			filterRequests(rows, { role: 'supervisor', search: '' }).map((r) => r.requestId),
		).toEqual(['b']);
		expect(filterRequests(rows, { role: 'all', search: '' })).toHaveLength(2);
	});

	it('searches name and email, ignoring case', () => {
		expect(filterRequests(rows, { role: 'all', search: 'DANA' }).map((r) => r.requestId)).toEqual([
			'a',
		]);
		expect(filterRequests(rows, { role: 'all', search: 'x.org' }).map((r) => r.requestId)).toEqual([
			'b',
		]);
		expect(filterRequests(rows, { role: 'all', search: 'nobody' })).toEqual([]);
	});
});

describe('labels', () => {
	it('names the school from the id, else from the applicant', () => {
		expect(schoolLabel({ schoolName: 'Alpha' })).toBe('Alpha');
		expect(schoolLabel({ schoolNameText: 'Beta', city: 'Haifa' })).toBe('Beta, Haifa');
		expect(schoolLabel({})).toBe('');
	});

	it('names the applicant', () => {
		expect(applicantName({ fullName: '', applicantDisplayName: 'Google Name' })).toBe(
			'Google Name',
		);
		expect(applicantName({ fullName: 'Typed Name', applicantDisplayName: 'Google Name' })).toBe(
			'Typed Name',
		);
	});

	it('a coordinator approval needs at least one school', () => {
		expect(canSubmitSchools('supervisor', [])).toBe(false);
		expect(canSubmitSchools('supervisor', ['s1'])).toBe(true);
		expect(canSubmitSchools('teacher', [])).toBe(true);
	});
});

describe('signUpUrl', () => {
	it('points at the Agora request form with the school fixed', () => {
		expect(signUpUrl('s 1', 'https://agora.example/')).toBe(
			'https://agora.example/teach/request?school=s%201',
		);
	});
});
