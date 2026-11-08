import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgoraSessionStatus, type AgoraSession } from '@freedi/shared-types';

vi.mock('./teacher', () => ({ fetchTeacherDashboard: vi.fn() }));
// The cache asks who is signed in so the dashboard can be read direct; the
// module behind that answer reaches firebase, which node has no business in.
const signedIn = vi.hoisted(() => ({ uid: null as string | null }));
vi.mock('./user', () => ({
	getUserState: () => ({ user: signedIn.uid ? { uid: signedIn.uid } : null }),
}));
// ...and so does the supervisor role, through its callables
vi.mock('./supervisor', () => ({ clearSupervisorRole: vi.fn(), noteDashboardRole: vi.fn() }));
import {
	clearTeacherNav,
	getTeacherNavState,
	isSessionLive,
	navClass,
	noteTeacherDashboard,
} from './teacherNav';
import type { TeacherDashboard } from './teacher';

describe('teacher menu cache ownership', () => {
	const dashboard: TeacherDashboard = {
		supervisedSchools: [],
		isSystemAdmin: false,
		classes: [{ classId: 'c1', name: 'Blue', classCode: 'ABC123', memberCount: 3, schoolId: 's' }],
		schools: [],
		aggregates: new Map(),
		sessions: [],
	};

	beforeEach(() => {
		clearTeacherNav();
		signedIn.uid = null;
	});

	it('serves the cache to the account it was filled for', () => {
		signedIn.uid = 'teacher-a';
		noteTeacherDashboard(dashboard, 'teacher-a');
		expect(navClass('c1')?.classCode).toBe('ABC123');
		expect(getTeacherNavState().loaded).toBe(true);
	});

	it('forgets the last account once the uid changes under the page', () => {
		signedIn.uid = 'teacher-a';
		noteTeacherDashboard(dashboard, 'teacher-a');
		signedIn.uid = 'teacher-b';
		expect(navClass('c1')).toBeNull();
		expect(getTeacherNavState().loaded).toBe(false);
	});

	it('drops an answer that was read for someone other than the signed-in teacher', () => {
		signedIn.uid = 'teacher-b';
		noteTeacherDashboard(dashboard, 'teacher-a');
		expect(navClass('c1')).toBeNull();
	});
});

describe('lesson archive classification', () => {
	const now = Date.now();
	function session(patch: Partial<AgoraSession> = {}): AgoraSession {
		return {
			status: AgoraSessionStatus.open,
			createdAt: now,
			lessonEndsAt: now + 60000,
			...patch,
		} as AgoraSession;
	}
	it('keeps an unexpired open lesson active', () => {
		expect(isSessionLive(session())).toBe(true);
	});
	it('archives expired lessons even before the server sweep closes them', () => {
		expect(isSessionLive(session({ lessonEndsAt: now - 1 }))).toBe(false);
	});
	it('archives legacy open lessons after a day rather than accumulating live banners', () => {
		expect(isSessionLive(session({ lessonEndsAt: undefined, createdAt: now - 48 * 3600000 }))).toBe(
			false,
		);
	});
});
