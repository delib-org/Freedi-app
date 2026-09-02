import { describe, expect, it } from 'vitest';
import { critiquePlan, looksLikeOpenQuestion, RECOMMENDED_MAX_ACTIVITIES } from '../critic';
import { action, activity, DAY_MS, NOW, plan } from './helpers';

describe('critiquePlan', () => {
	it('accepts a clean plan', () => {
		const report = critiquePlan(
			plan({
				activities: [
					activity({ tempId: 'a1', role: 'widen' }),
					activity({ tempId: 'a2', type: 'discussion', role: 'decide', order: 1, openNow: false, title: 'What do we decide?' }),
				],
				scheduledActions: [
					action({ tempId: 's1', action: 'close', at: NOW + 10 * DAY_MS }),
					action({ tempId: 's2', activityTempId: 'a2', action: 'open', at: NOW + 12 * DAY_MS }),
					action({ tempId: 's3', activityTempId: 'a2', action: 'close', at: NOW + 19 * DAY_MS }),
					action({ tempId: 's4', action: 'nudge', at: NOW + 7 * DAY_MS, nudgeMessage: 'Three days left!' }),
				],
			}),
			{ now: NOW, diagnosis: { audienceSize: 'community' } },
		);
		expect(report).toEqual({ problems: [], blocking: false });
	});

	it('accepts a full question-first chain with a draft step', () => {
		const report = critiquePlan(
			plan({
				activities: [
					activity({ tempId: 'a1', role: 'widen' }),
					activity({ tempId: 'a2', type: 'document', role: 'comment', order: 1, openNow: false, title: 'What works in the draft?', draftFrom: ['a1'] }),
					activity({ tempId: 'a3', type: 'discussion', role: 'decide', order: 2, openNow: false, title: 'Do we adopt it?' }),
				],
				scheduledActions: [
					action({ tempId: 's1', action: 'close', at: NOW + 14 * DAY_MS }),
					action({ tempId: 's2', activityTempId: 'a2', action: 'draft', at: NOW + 14 * DAY_MS + 1, draftFrom: ['a1'] }),
					action({ tempId: 's3', activityTempId: 'a2', action: 'open', at: NOW + 16 * DAY_MS }),
					action({ tempId: 's4', activityTempId: 'a2', action: 'close', at: NOW + 26 * DAY_MS }),
					action({ tempId: 's5', activityTempId: 'a3', action: 'open', at: NOW + 27 * DAY_MS }),
				],
			}),
			{ now: NOW, diagnosis: { audienceSize: 'community' } },
		);
		expect(report).toEqual({ problems: [], blocking: false });
	});

	it('a document opened before (or at) its draft step is blocking', () => {
		const report = critiquePlan(
			plan({
				activities: [
					activity({ tempId: 'a1', role: 'widen' }),
					activity({ tempId: 'a2', type: 'document', role: 'comment', order: 1, openNow: false, title: 'What works?', draftFrom: ['a1'] }),
					activity({ tempId: 'a3', type: 'discussion', role: 'decide', order: 2, title: 'Do we adopt it?' }),
				],
				scheduledActions: [
					action({ tempId: 's1', activityTempId: 'a2', action: 'open', at: NOW + 10 * DAY_MS }),
					action({ tempId: 's2', activityTempId: 'a2', action: 'draft', at: NOW + 12 * DAY_MS }),
				],
			}),
			{ now: NOW },
		);
		expect(report.blocking).toBe(true);
		expect(report.problems[0]).toMatch(/before its draft step/);
	});

	it('a live session before any document or survey is a warning (comment before converging)', () => {
		const report = critiquePlan(
			plan({
				activities: [
					activity({ tempId: 'a1', type: 'liveSession', role: 'converge', title: 'Which ideas unite us?' }),
					activity({ tempId: 'a2', type: 'document', role: 'comment', order: 1, title: 'What works?' }),
					activity({ tempId: 'a3', type: 'discussion', role: 'decide', order: 2, title: 'Do we adopt it?' }),
				],
			}),
			{ now: NOW },
		);
		expect(report.blocking).toBe(false);
		expect(report.problems.some((problem) => /comment before converging/.test(problem))).toBe(true);
	});

	it('a multi-step process that does not end with decide/ratify is a warning; a single pulse is fine', () => {
		const noDecision = critiquePlan(
			plan({
				activities: [
					activity({ tempId: 'a1', role: 'widen' }),
					activity({ tempId: 'a2', type: 'document', role: 'comment', order: 1, title: 'What works?' }),
				],
			}),
			{ now: NOW },
		);
		expect(noDecision.blocking).toBe(false);
		expect(noDecision.problems.some((problem) => /instead of a decision/.test(problem))).toBe(true);
		const pulse = critiquePlan(plan(), { now: NOW });
		expect(pulse.problems.some((problem) => /instead of a decision/.test(problem))).toBe(false);
		const ratified = critiquePlan(
			plan({
				activities: [
					activity({ tempId: 'a1', role: 'widen' }),
					activity({ tempId: 'a2', type: 'discussion', role: 'ratify', order: 1, title: 'Do we ratify?' }),
				],
			}),
			{ now: NOW },
		);
		expect(ratified.problems.some((problem) => /instead of a decision/.test(problem))).toBe(false);
	});

	it('flags decide before widen', () => {
		const report = critiquePlan(
			plan({
				activities: [
					activity({ tempId: 'a1', type: 'discussion', role: 'decide', title: 'What do we decide?' }),
					activity({ tempId: 'a2', role: 'widen', order: 1 }),
				],
			}),
			{ now: NOW },
		);
		expect(report.blocking).toBe(false);
		expect(report.problems.some((problem) => /decides before/.test(problem))).toBe(true);
	});

	it('flags close before open', () => {
		const report = critiquePlan(
			plan({
				activities: [activity({ tempId: 'a1', openNow: false })],
				scheduledActions: [
					action({ tempId: 's1', action: 'open', at: NOW + 10 * DAY_MS }),
					action({ tempId: 's2', action: 'close', at: NOW + 5 * DAY_MS }),
				],
			}),
			{ now: NOW },
		);
		expect(report.problems.some((problem) => /close .* before the open/.test(problem))).toBe(true);
	});

	it('flags a scheduled open on an openNow activity', () => {
		const report = critiquePlan(
			plan({ scheduledActions: [action({ tempId: 's1', action: 'open', at: NOW + DAY_MS })] }),
			{ now: NOW },
		);
		expect(report.problems.some((problem) => /already opens now/.test(problem))).toBe(true);
		expect(report.blocking).toBe(false);
	});

	it('more than 6 activities is blocking, 6 is a warning, 5 is fine, 0 is blocking', () => {
		const many = (count: number) =>
			Array.from({ length: count }, (_, i) =>
				activity({ tempId: `a${i + 1}`, order: i, ...(i === count - 1 ? { type: 'discussion', role: 'decide', title: 'Decide?' } : {}) }),
			);
		expect(RECOMMENDED_MAX_ACTIVITIES).toBe(5);
		expect(critiquePlan(plan({ activities: many(7) }), { now: NOW }).blocking).toBe(true);
		const six = critiquePlan(plan({ activities: many(6) }), { now: NOW });
		expect(six.blocking).toBe(false);
		expect(six.problems.some((problem) => /6 activities/.test(problem))).toBe(true);
		const five = critiquePlan(plan({ activities: many(5) }), { now: NOW });
		expect(five.problems.some((problem) => /5 activities/.test(problem))).toBe(false);
		expect(critiquePlan(plan({ activities: [] }), { now: NOW }).blocking).toBe(true);
	});

	it('a past date is blocking', () => {
		const report = critiquePlan(
			plan({ scheduledActions: [action({ tempId: 's1', at: NOW - DAY_MS, atLocal: '2020-01-01T10:00:00+02:00' })] }),
			{ now: NOW },
		);
		expect(report.blocking).toBe(true);
		expect(report.problems[0]).toMatch(/in the past/);
	});

	it('flags nudges without a message or over the limit', () => {
		const report = critiquePlan(
			plan({
				scheduledActions: [
					action({ tempId: 's1', action: 'nudge', at: NOW + DAY_MS }),
					action({ tempId: 's2', action: 'nudge', at: NOW + DAY_MS, nudgeMessage: 'x'.repeat(300) }),
				],
			}),
			{ now: NOW },
		);
		expect(report.problems.filter((problem) => /nudge/.test(problem))).toHaveLength(2);
	});

	it('flags audience mismatches', () => {
		const onlyDiscussion = critiquePlan(
			plan({ activities: [activity({ tempId: 'a1', type: 'discussion', role: 'widen' })] }),
			{ now: NOW, diagnosis: { audienceSize: 'public' } },
		);
		expect(onlyDiscussion.problems.some((problem) => /public-sized/.test(problem))).toBe(true);
		const teamSurvey = critiquePlan(plan(), { now: NOW, diagnosis: { audienceSize: 'team' } });
		expect(teamSurvey.problems.some((problem) => /audience is a team/.test(problem))).toBe(true);
	});

	it('flags non-questions and double-barreled titles (non-blocking)', () => {
		const report = critiquePlan(
			plan({
				activities: [
					activity({ tempId: 'a1', title: 'Park improvements' }),
					activity({ tempId: 'a2', title: 'What do we build? And when?', order: 1, type: 'discussion', role: 'decide' }),
				],
			}),
			{ now: NOW },
		);
		expect(report.blocking).toBe(false);
		expect(report.problems.some((problem) => /open question/.test(problem))).toBe(true);
		expect(report.problems.some((problem) => /double-barreled/.test(problem))).toBe(true);
	});
});

describe('looksLikeOpenQuestion', () => {
	it('accepts question marks and English openers', () => {
		expect(looksLikeOpenQuestion('מה נשפר קודם?')).toBe(true);
		expect(looksLikeOpenQuestion('How should we proceed')).toBe(true);
		expect(looksLikeOpenQuestion('Park plan')).toBe(false);
	});

	it('advises seeding a crowd survey that would open empty', () => {
		const report = critiquePlan(
			{
				mainQuestion: { title: 'Q?' },
				activities: [activity({ tempId: 'a1', role: 'widen', survey: { seedOptions: ['Only one'] } })],
				scheduledActions: [],
				summary: '',
			},
			{ now: NOW },
		);
		expect(report.blocking).toBe(false);
		expect(report.problems.some((p) => /starting suggestions/.test(p))).toBe(true);
	});
});
