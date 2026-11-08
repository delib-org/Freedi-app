// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AGORA_TEACHER_USAGE } from '@freedi/shared-types';

interface Beat {
	surface: string;
	sinceMs: number;
}

const heartbeat = vi.fn<(request: Beat) => Promise<{ creditedMs: number }>>(() =>
	Promise.resolve({ creditedMs: 0 }),
);
let route = '/teach';
let tier: 0 | 2 = 2;
let uid: string | null = 'teacher-1';

vi.mock('../callables', () => ({
	teacherHeartbeat: (request: Beat) => heartbeat(request),
}));
vi.mock('../user', () => ({
	getUserState: () => ({ tier, user: uid ? { uid } : null, loading: false, signInError: null }),
}));
vi.mock('mithril', () => ({
	default: { route: { get: () => route }, redraw: () => undefined },
}));

import { startUsageHeartbeat, stopUsageHeartbeat, SAMPLE_MS } from '../usageHeartbeat';

const INTERVAL = AGORA_TEACHER_USAGE.HEARTBEAT_INTERVAL_MS;

function touch(): void {
	window.dispatchEvent(new Event('pointerdown'));
}

/** Keep the teacher "active": one touch every 30 s, inside the 60 s window */
function workFor(ms: number): void {
	const step = 30_000;
	for (let t = 0; t < ms; t += step) {
		touch();
		vi.advanceTimersByTime(Math.min(step, ms - t));
	}
}

function setHidden(hidden: boolean): void {
	Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
	document.dispatchEvent(new Event('visibilitychange'));
}

describe('usage heartbeat', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-22T10:00:00Z'));
		heartbeat.mockClear();
		route = '/teach';
		tier = 2;
		uid = 'teacher-1';
		setHidden(false);
	});

	afterEach(() => {
		stopUsageHeartbeat();
		vi.useRealTimers();
	});

	it('beats once an interval of ACTIVE time has accumulated', () => {
		startUsageHeartbeat();
		workFor(INTERVAL);
		expect(heartbeat).toHaveBeenCalledTimes(1);
		expect(heartbeat).toHaveBeenCalledWith({ surface: 'home', sinceMs: INTERVAL });
	});

	it('does not count idle wall time', () => {
		startUsageHeartbeat();
		touch();
		// One touch opens a 60 s window; the rest of the interval is silence.
		vi.advanceTimersByTime(INTERVAL);
		expect(heartbeat).toHaveBeenCalledTimes(1);
		expect(heartbeat.mock.calls[0]?.[0].sinceMs).toBe(60_000);
	});

	it('counts nothing while the tab is hidden', () => {
		startUsageHeartbeat();
		setHidden(true);
		workFor(INTERVAL);
		expect(heartbeat).not.toHaveBeenCalled();
	});

	it('never reports an anonymous or signed-out user', () => {
		tier = 0;
		startUsageHeartbeat();
		workFor(INTERVAL * 2);
		expect(heartbeat).not.toHaveBeenCalled();
	});

	it('ignores student and unknown routes', () => {
		route = '/play/abc';
		startUsageHeartbeat();
		workFor(INTERVAL * 2);
		expect(heartbeat).not.toHaveBeenCalled();
	});

	it('flushes to the old surface when the route changes', () => {
		startUsageHeartbeat();
		workFor(90_000);
		route = '/supervise';
		window.dispatchEvent(new Event('hashchange'));
		expect(heartbeat).toHaveBeenCalledTimes(1);
		expect(heartbeat.mock.calls[0]?.[0]).toEqual({ surface: 'home', sinceMs: 90_000 });
	});

	it('flushes on pagehide and on stop', () => {
		startUsageHeartbeat();
		workFor(45_000);
		window.dispatchEvent(new Event('pagehide'));
		expect(heartbeat).toHaveBeenCalledTimes(1);
		workFor(SAMPLE_MS * 2);
		stopUsageHeartbeat();
		expect(heartbeat).toHaveBeenCalledTimes(2);
		// Stopped: more activity reports nothing
		workFor(INTERVAL);
		expect(heartbeat).toHaveBeenCalledTimes(2);
	});

	it('drops pending time when the account changes', () => {
		startUsageHeartbeat();
		workFor(90_000);
		uid = 'teacher-2';
		touch();
		workFor(60_000);
		stopUsageHeartbeat();
		// The first teacher's 90 s never went out under the second's name
		for (const [request] of heartbeat.mock.calls)
			expect(request.sinceMs).toBeLessThanOrEqual(90_000);
	});
});
