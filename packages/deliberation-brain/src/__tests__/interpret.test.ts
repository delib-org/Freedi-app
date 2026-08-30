import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAFT_CUTOFF, STUDIO_NUDGE_MESSAGE_MAX } from '@freedi/shared-types';
import { interpretLlmResponse, normalizePlan, PlanParseError } from '../interpret';
import type { InterpretOptions } from '../interpret';
import { DAY_MS, futureIso, NOW } from './helpers';

const HOUR_MS = 60 * 60 * 1000;
const newOpts: InterpretOptions = { mode: 'new', existingIds: [], now: NOW };

function response(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		diagnosis: { decisionType: 'gatherIdeas', audienceSize: 'community', bogus: 'ignored', polarization: 'weird' },
		patternId: 'questionFirstAgreement',
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

/** A question-first plan: survey → document drafted from it → decide. */
function draftPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		mainQuestion: { title: 'How do we live with the dogs?' },
		activities: [
			{ tempId: 'a1', type: 'crowdSurvey', title: 'How do we live in peace with the dogs?', openNow: true, role: 'widen' },
			{
				tempId: 'a2',
				type: 'document',
				title: 'What in the proposed agreement works?',
				openNow: false,
				role: 'comment',
				draftFrom: ['a1'],
				draftIntent: 'An agreement on dogs.',
			},
			{ tempId: 'a3', type: 'discussion', title: 'Do we adopt the agreement?', openNow: false, role: 'decide' },
		],
		scheduledActions: [
			{ tempId: 's1', target: 'a1', action: 'close', at: futureIso(14) },
			{ tempId: 's2', target: 'a2', action: 'draft', at: futureIso(14, 21) },
			{ tempId: 's3', target: 'a2', action: 'open', at: futureIso(16) },
			{ tempId: 's4', target: 'a2', action: 'close', at: futureIso(26) },
			{ tempId: 's5', target: 'a3', action: 'open', at: futureIso(27) },
		],
		summary: 'Question first.',
		...overrides,
	};
}

describe('interpretLlmResponse', () => {
	it('turns a valid response into a plan, sanitized diagnosis and known pattern', () => {
		const out = interpretLlmResponse(response(), newOpts);
		expect(out.plan).toBeDefined();
		expect(out.reply).toBe('Here is a plan.');
		expect(out.diagnosis).toEqual({ decisionType: 'gatherIdeas', audienceSize: 'community' });
		expect(out.patternId).toBe('questionFirstAgreement');
		expect(out.missingCritical).toEqual(['timeHorizonDays']);
		expect(out.blocking).toBe(false);
	});

	it('drops a retired pattern id', () => {
		expect(interpretLlmResponse(response({ patternId: 'widenConvergeDecide' }), newOpts).patternId).toBeUndefined();
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

	it('merges the diagnosis with the previous one, including the entry-rule fields', () => {
		const out = interpretLlmResponse(response({ diagnosis: { polarization: 'contested', hasDraft: 'material', decisionBody: 'council', audienceSegments: ['members', ' youth '] } }), {
			...newOpts,
			previousDiagnosis: { decisionType: 'allocate', whoDecides: 'the council' },
		});
		expect(out.diagnosis).toEqual({
			decisionType: 'allocate',
			whoDecides: 'the council',
			polarization: 'contested',
			hasDraft: 'material',
			decisionBody: 'council',
			audienceSegments: ['members', 'youth'],
		});
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

	it('rejects the experimental engine at the schema (closed engine set)', () => {
		expect(() =>
			interpretLlmResponse({ reply: 'x', plan: { mainQuestion: { title: 'Q?' }, activities: [{ type: 'agora', title: 'Q?' }] } }, newOpts),
		).toThrow(PlanParseError);
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

	it('keeps a complete draft chain as-is, with the default cutoff', () => {
		const out = normalizePlan(draftPlan(), newOpts);
		const document = out.plan!.activities[1];
		expect(document).toMatchObject({ openNow: false, draftFrom: ['a1'], draftCutoff: DEFAULT_DRAFT_CUTOFF, draftIntent: 'An agreement on dogs.' });
		expect(out.plan!.scheduledActions.map((action) => action.action)).toEqual(['close', 'draft', 'open', 'close', 'open']);
		expect(out.plan!.scheduledActions[1].draftFrom).toEqual(['a1']);
		expect(out.problems).toEqual([]);
	});

	it('resolves draftFrom against plan tempIds and existing ids, dropping unknown and self', () => {
		const plan = draftPlan();
		(plan.activities as Array<Record<string, unknown>>)[1].draftFrom = ['a1', 'a2', 'zzz', 'st9'];
		const out = normalizePlan(plan, { mode: 'existing', existingIds: ['st9'], now: NOW });
		expect(out.plan!.activities[1].draftFrom).toEqual(['a1', 'st9']);
		expect(out.problems.some((problem) => /"zzz" is not an activity/.test(problem))).toBe(true);
	});

	it('synthesizes a draft step 1h after the last source closes, plus an open 2 days later', () => {
		const plan = draftPlan({
			scheduledActions: [
				{ tempId: 's1', target: 'a1', action: 'close', at: futureIso(14) },
				{ tempId: 's2', target: 'a2', action: 'close', at: futureIso(26) },
			],
		});
		const out = normalizePlan(plan, { ...newOpts, timezone: 'Asia/Jerusalem' });
		const actions = out.plan!.scheduledActions;
		const draft = actions.find((action) => action.action === 'draft')!;
		const open = actions.find((action) => action.action === 'open' && action.activityTempId === 'a2')!;
		expect(draft.at).toBe(Date.parse(futureIso(14)) + HOUR_MS);
		expect(draft.draftFrom).toEqual(['a1']);
		expect(draft.atLocal).toMatch(/\+0[23]:00$/);
		expect(open.at).toBe(draft.at + 2 * DAY_MS);
		expect(out.problems.some((problem) => /added a draft step/.test(problem))).toBe(true);
	});

	it('synthesizes the draft step for tomorrow when no source closes', () => {
		const out = normalizePlan(draftPlan({ scheduledActions: [] }), newOpts);
		const draft = out.plan!.scheduledActions.find((action) => action.action === 'draft')!;
		expect(draft.at).toBe(NOW + DAY_MS);
	});

	it('a new document without sources opens now with a non-blocking note', () => {
		const plan = draftPlan();
		delete (plan.activities as Array<Record<string, unknown>>)[1].draftFrom;
		const out = normalizePlan(plan, newOpts);
		expect(out.plan!.activities[1].openNow).toBe(true);
		expect(out.plan!.activities[1].draftFrom).toBeUndefined();
		expect(out.problems.some((problem) => /must already have its text/.test(problem))).toBe(true);
		expect(out.plan!.scheduledActions.some((action) => action.action === 'draft')).toBe(false);
	});

	it('a draft action must target a document; its own sources fill an empty document', () => {
		const plan = draftPlan();
		delete (plan.activities as Array<Record<string, unknown>>)[1].draftFrom;
		plan.scheduledActions = [
			{ tempId: 's1', target: 'a1', action: 'draft', at: futureIso(14) },
			{ tempId: 's2', target: 'a2', action: 'draft', at: futureIso(14), draftFrom: ['a1'] },
			{ tempId: 's3', target: 'a2', action: 'open', at: futureIso(16) },
		];
		const out = normalizePlan(plan, newOpts);
		expect(out.problems.some((problem) => /must target a document/.test(problem))).toBe(true);
		expect(out.plan!.scheduledActions.map((action) => action.action)).toEqual(['draft', 'open']);
		expect(out.plan!.activities[1]).toMatchObject({ draftFrom: ['a1'], openNow: false, draftCutoff: DEFAULT_DRAFT_CUTOFF });
	});

	it('drops draft fields on a non-document and a survey on a document', () => {
		const out = normalizePlan(
			{
				mainQuestion: { title: 'Q?' },
				activities: [
					{ tempId: 'a1', type: 'crowdSurvey', title: 'A?', draftFrom: ['a2'] },
					{ tempId: 'a2', type: 'document', title: 'B?', survey: { intro: 'x' }, draftCutoff: { mode: 'threshold', minConsensus: 0.4 } },
				],
			},
			newOpts,
		);
		expect(out.plan!.activities[0].draftFrom).toBeUndefined();
		expect(out.plan!.activities[1].survey).toBeUndefined();
		expect(out.problems.some((problem) => /only a document can be drafted/.test(problem))).toBe(true);
	});

	it('normalizes an explicit cutoff', () => {
		const plan = draftPlan();
		(plan.activities as Array<Record<string, unknown>>)[1].draftCutoff = { mode: 'threshold', minConsensus: 0.4, minEvaluators: 5.4 };
		const out = normalizePlan(plan, newOpts);
		expect(out.plan!.activities[1].draftCutoff).toEqual({ mode: 'threshold', minConsensus: 0.4, minEvaluators: 5 });
	});
});
