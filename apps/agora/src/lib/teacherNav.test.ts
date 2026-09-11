import { describe, expect, it, vi } from 'vitest';
import { AgoraSessionStatus, type AgoraSession } from '@freedi/shared-types';

vi.mock('./teacher', () => ({ fetchTeacherDashboard: vi.fn() }));
import { isSessionLive } from './teacherNav';

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
