import { describe, expect, it } from 'vitest';
import { STUDIO_NUDGE_MESSAGE_MAX } from '@freedi/shared-types';
import { interpretLlmResponse, normalizePlan, PlanParseError } from '../interpret';
import type { InterpretOptions } from '../interpret';
import { futureIso, NOW } from './helpers';

const newOpts: InterpretOptions = { mode: 'new', existingIds: [], now: NOW };

function response(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		diagnosis: { decisionType: 'gatherIdeas', audienceSize: 'community', bogus: 'ignored', polarization: 'weird' },
		patternId: 'widenConvergeDecide',
		missingCritical: ['timeHorizonDays', 'notAField'],
		reply: 'Here is a plan.',
		readyToBuild: false,
		plan: {
			mainQuestion: { title: 'How should we improve the park?' },
			activities: [
				{
					type: 'crowdSurvey',
					title: 'What would make the park better?',
					openNow: true,
					role: 'widen',
					survey: { allowParticipantsToAddSuggestions: true, extraQuestions: [{ title: 'Why?' }] },
				},
				{ type: 'liveSession', title: 'Which ideas can we unite behind?', openNow: false, role: 'converge', survey: { intro: 'x' } },
			],
			scheduledActions: [
				{ target: 'a1', action: 'close', at: '2030-09-10T20:00:00+03:00' },
				{ target: 'a2', action: 'open', at: futureIso(16) },
				{ target: 'a1', action: 'nudge', at: futureIso(11), nudgeMessage: 'Last days!' },
			],
			summary: 'Widen then converge.',
		},
		...overrides,
	};
}

describe('interpretLlmResponse', () => {
	it('turns a valid response into a plan, sanitized diagnosis and known pattern', () => {
		const out = interpretLlmResponse(response(), newOpts);
		expect(out.plan).toBeDefined();
		expect(out.reply).toBe('Here is a plan.');
		expect(out.diagnosis).toEqual({ decisionType: 'gatherIdeas', audienceSize: 'community' });
		expect(out.patternId).toBe('widenConvergeDecide');
		expect(out.missingCritical).toEqual(['timeHorizonDays']);
		expect(out.blocking).toBe(false);
	});

	it('fills tempIds, order and converts ISO with offset to ms', () => {
		const out = interpretLlmResponse(response(), newOpts);
		const plan = out.plan!;
		expect(plan.activities.map((activity) => activity.tempId)).toEqual(['a1', 'a2']);
		expect(plan.activities.map((activity) => activity.order)).toEqual([0, 1]);
		const close = plan.scheduledActions.find((action) => action.action === 'close')!;
		expect(close.at).toBe(Date.parse('2030-09-10T17:00:00Z'));
		expect(close.atLocal).toBe('2030-09-10T20:00:00+03:00');
		expect(close.activityTempId).toBe('a1');
		expect(plan.scheduledActions.map((action) => action.tempId)).toEqual(['s1', 's2', 's3']);
	});

	it('drops the survey on a liveSession and fills extra-question tempIds', () => {
		const plan = interpretLlmResponse(response(), newOpts).plan!;
		expect(plan.activities[1].survey).toBeUndefined();
		expect(plan.activities[0].survey?.extraQuestions?.[0].tempId).toBe('a1-q1');
	});

	it('drops past dates with a problem', () => {
		const out = interpretLlmResponse(
			response({
				plan: {
					...(response().plan as Record<string, unknown>),
					scheduledActions: [{ target: 'a1', action: 'close', at: '2020-01-01T10:00:00+02:00' }],
				},
			}),
			newOpts,
		);
		expect(out.plan?.scheduledActions).toHaveLength(0);
		expect(out.problems.some((problem) => /in the past/.test(problem))).toBe(true);
	});

	it('drops unreadable dates and unknown targets with problems', () => {
		const out = interpretLlmResponse(
			response({
				plan: {
					...(response().plan as Record<string, unknown>),
					scheduledActions: [
						{ target: 'a1', action: 'close', at: 'next tuesday' },
						{ target: 'zzz', action: 'close', at: futureIso(5) },
					],
				},
			}),
			newOpts,
		);
		expect(out.plan?.scheduledActions).toHaveLength(0);
		expect(out.problems.some((problem) => /unreadable date/.test(problem))).toBe(true);
		expect(out.problems.some((problem) => /not an activity/.test(problem))).toBe(true);
	});

	it('forces change "add" and strips existingStatementId in new mode', () => {
		const out = interpretLlmResponse(
			response({
				plan: {
					...(response().plan as Record<string, unknown>),
					activities: [{ type: 'discussion', title: 'What next?', change: 'keep', existingStatementId: 'x1' }],
				},
			}),
			newOpts,
		);
		expect(out.plan?.activities[0].change).toBe('add');
		expect(out.plan?.activities[0].existingStatementId).toBeUndefined();
	});

	it('existing mode: keeps known ids, turns unknown ids into add, resolves statementId targets', () => {
		const opts: InterpretOptions = { mode: 'existing', existingIds: ['st1'], now: NOW };
		const out = interpretLlmResponse(
			response({
				plan: {
					mainQuestion: { title: 'Q?' },
					activities: [
						{ type: 'discussion', title: 'What do we keep?', change: 'keep', existingStatementId: 'st1' },
						{ type: 'discussion', title: 'What is unknown?', change: 'update', existingStatementId: 'ghost' },
						{ type: 'crowdSurvey', title: 'What is new?', change: 'add' },
					],
					scheduledActions: [{ target: 'st1', action: 'close', at: futureIso(3) }],
					summary: 's',
				},
			}),
			opts,
		);
		const [keep, ghost, added] = out.plan!.activities;
		expect(keep.change).toBe('keep');
		expect(keep.existingStatementId).toBe('st1');
		expect(ghost.change).toBe('add');
		expect(ghost.existingStatementId).toBeUndefined();
		expect(added.change).toBe('add');
		expect(out.plan!.scheduledActions[0].statementId).toBe('st1');
		expect(out.plan!.scheduledActions[0].activityTempId).toBeUndefined();
		expect(out.problems.some((problem) => /ghost/.test(problem))).toBe(true);
	});

	it('trims nudge messages to the maximum', () => {
		const long = 'x'.repeat(STUDIO_NUDGE_MESSAGE_MAX + 50);
		const out = interpretLlmResponse(
			response({
				plan: {
					...(response().plan as Record<string, unknown>),
					scheduledActions: [{ target: 'a1', action: 'nudge', at: futureIso(4), nudgeMessage: long }],
				},
			}),
			newOpts,
		);
		expect(out.plan?.scheduledActions[0].nudgeMessage?.length).toBe(STUDIO_NUDGE_MESSAGE_MAX);
	});

	it('readyToBuild is false when there is no plan', () => {
		const out = interpretLlmResponse({ reply: 'Tell me more?', readyToBuild: true, plan: null }, newOpts);
		expect(out.plan).toBeUndefined();
		expect(out.readyToBuild).toBe(false);
	});

	it('merges the diagnosis with the previous one', () => {
		const out = interpretLlmResponse(response({ diagnosis: { polarization: 'contested' } }), {
			...newOpts,
			previousDiagnosis: { decisionType: 'allocate', whoDecides: 'the council' },
		});
		expect(out.diagnosis).toEqual({ decisionType: 'allocate', whoDecides: 'the council', polarization: 'contested' });
	});

	it('throws PlanParseError with readable issues on a bad shape', () => {
		expect(() => interpretLlmResponse({ readyToBuild: 'yes' }, newOpts)).toThrow(PlanParseError);
		try {
			interpretLlmResponse({ reply: 'x', plan: { mainQuestion: {}, activities: [{ type: 'poll', title: 1 }] } }, newOpts);
		} catch (error) {
			expect(error).toBeInstanceOf(PlanParseError);
			const issues = (error as PlanParseError).issues;
			expect(issues.some((issue) => issue.startsWith('plan.mainQuestion.title'))).toBe(true);
			expect(issues.some((issue) => issue.startsWith('plan.activities.0.type'))).toBe(true);
		}
	});
});

describe('normalizePlan', () => {
	it('caps activities at the maximum with a problem', () => {
		const activities = Array.from({ length: 8 }, (_, i) => ({ type: 'discussion', title: `Q${i}?` }));
		const out = normalizePlan({ mainQuestion: { title: 'Q?' }, activities }, newOpts);
		expect(out.plan?.activities).toHaveLength(6);
		expect(out.problems.some((problem) => /only the first 6/.test(problem))).toBe(true);
	});

	it('returns undefined with a problem for an invalid shape', () => {
		const out = normalizePlan({ activities: 'nope' }, newOpts);
		expect(out.plan).toBeUndefined();
		expect(out.problems[0]).toMatch(/Plan shape invalid/);
	});

	it('renames duplicate tempIds', () => {
		const out = normalizePlan(
			{
				mainQuestion: { title: 'Q?' },
				activities: [
					{ tempId: 'a1', type: 'discussion', title: 'A?' },
					{ tempId: 'a1', type: 'discussion', title: 'B?' },
				],
			},
			newOpts,
		);
		expect(out.plan?.activities.map((activity) => activity.tempId)).toEqual(['a1', 'a2']);
	});
});
