// The package's setup mocks valibot; these tests need the real schema checks.
jest.unmock('valibot');

import { safeParse } from 'valibot';
import { LessonPlanSchema, lessonStatusOf, planLessonStatus } from '../index';

const STEPS = ['waiting', 'opening'] as const;

describe('LessonPlanSchema status fields', () => {
	it('still accepts a plan from before status existed', () => {
		const parsed = safeParse(LessonPlanSchema, { steps: [...STEPS], stepIndex: 1 });
		expect(parsed.success).toBe(true);
	});

	it('accepts the four statuses with their moments and refuses an unknown one', () => {
		for (const status of ['live', 'paused', 'open', 'ended']) {
			const parsed = safeParse(LessonPlanSchema, {
				steps: [...STEPS],
				stepIndex: 0,
				status,
				statusAt: 1,
				pausedAt: 2,
				endedAt: 3,
			});
			expect(parsed.success).toBe(true);
		}
		expect(safeParse(LessonPlanSchema, { steps: [...STEPS], stepIndex: 0, status: 'closed' }).success).toBe(
			false,
		);
	});
});

describe('lessonStatusOf', () => {
	it('treats a missing status as live', () => {
		expect(lessonStatusOf(undefined)).toBe('live');
		expect(lessonStatusOf({})).toBe('live');
		expect(lessonStatusOf({ status: 'paused' })).toBe('paused');
	});
});

describe('planLessonStatus', () => {
	const NOW = 1_800_000_100_000;

	it('pauses a live lesson and records when', () => {
		expect(planLessonStatus({}, 'pause', NOW)).toMatchObject({
			status: 'paused',
			pausedAt: NOW,
			changed: true,
			shiftMs: 0,
		});
	});

	it('pauses an open lesson (it returns to live on resume)', () => {
		expect(planLessonStatus({ status: 'open' }, 'pause', NOW).status).toBe('paused');
	});

	it('resumes with the pause length and clears pausedAt', () => {
		const change = planLessonStatus({ status: 'paused', pausedAt: NOW - 30_000 }, 'resume', NOW);
		expect(change).toMatchObject({ status: 'live', shiftMs: 30_000, clearPausedAt: true });
	});

	it('resumes with no shift when pausedAt is missing, never negative', () => {
		expect(planLessonStatus({ status: 'paused' }, 'resume', NOW).shiftMs).toBe(0);
		expect(planLessonStatus({ status: 'paused', pausedAt: NOW + 5 }, 'resume', NOW).shiftMs).toBe(0);
	});

	it('ends from live, paused and open; keeps open from live and paused', () => {
		for (const status of ['live', 'paused', 'open'] as const) {
			expect(planLessonStatus({ status }, 'end', NOW)).toMatchObject({
				status: 'ended',
				endedAt: NOW,
			});
		}
		for (const status of ['live', 'paused'] as const) {
			expect(planLessonStatus({ status }, 'keepOpen', NOW)).toMatchObject({
				status: 'open',
				endedAt: NOW,
			});
		}
	});

	it('clears pausedAt when a paused lesson ends', () => {
		expect(planLessonStatus({ status: 'paused', pausedAt: 1 }, 'end', NOW).clearPausedAt).toBe(true);
	});

	it('reopens an ended lesson to live', () => {
		expect(planLessonStatus({ status: 'ended' }, 'reopen', NOW).status).toBe('live');
	});

	it('treats a repeat of the current status as a no-op', () => {
		expect(planLessonStatus({ status: 'paused' }, 'pause', NOW).changed).toBe(false);
		expect(planLessonStatus({ status: 'ended' }, 'end', NOW).changed).toBe(false);
		expect(planLessonStatus({ status: 'open' }, 'keepOpen', NOW).changed).toBe(false);
		expect(planLessonStatus({}, 'resume', NOW).changed).toBe(false);
		expect(planLessonStatus({}, 'reopen', NOW).changed).toBe(false);
	});

	it('refuses the moves the status does not allow', () => {
		expect(() => planLessonStatus({ status: 'ended' }, 'pause', NOW)).toThrow(RangeError);
		expect(() => planLessonStatus({ status: 'ended' }, 'keepOpen', NOW)).toThrow(RangeError);
		expect(() => planLessonStatus({ status: 'open' }, 'resume', NOW)).toThrow(RangeError);
		expect(() => planLessonStatus({ status: 'paused' }, 'reopen', NOW)).toThrow(RangeError);
	});
});
