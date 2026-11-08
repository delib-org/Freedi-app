import { describe, it, expect } from 'vitest';
import { usageSurface, sampleUsage, type UsageClock } from '../usageClock';

const clock: UsageClock = {
	at: 1000,
	activeUntil: 61000,
	surface: 'home',
	uid: 'teacher',
	visible: true,
	pendingMs: 0,
};
describe('teacher activity clock', () => {
	it('counts only the visible interval before inactivity', () => {
		expect(sampleUsage(clock, 121000).pendingMs).toBe(60000);
	});
	it('never credits hidden or anonymous screens', () => {
		expect(sampleUsage({ ...clock, visible: false }, 10000).pendingMs).toBe(0);
		expect(sampleUsage({ ...clock, uid: null }, 10000).pendingMs).toBe(0);
	});
	it('excludes all student and unknown routes', () => {
		expect(usageSurface('/play/123')).toBeNull();
		expect(usageSurface('/teacher')).toBeNull();
		expect(usageSurface('/teach/unknown')).toBeNull();
	});
	it('maps known teacher and supervisor surfaces', () => {
		expect(usageSurface('/teach/screen/a')).toBe('projector');
		expect(usageSurface('/supervise/student/b')).toBe('supervise');
		expect(usageSurface('/teach/start?classId=a')).toBe('start');
	});
	it('does not credit the same interval twice', () => {
		const next = sampleUsage(clock, 11000);
		expect(sampleUsage(next, 11000).pendingMs).toBe(10000);
	});
});
