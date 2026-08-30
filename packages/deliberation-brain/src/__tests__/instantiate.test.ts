import { describe, expect, it } from 'vitest';
import { safeParse } from 'valibot';
import { DEFAULT_DRAFT_CUTOFF, StudioPlanSchema } from '@freedi/shared-types';
import { DRAFT_REVIEW_DAYS, HOUR_MS, instantiatePattern, fillTemplate } from '../instantiate';
import { getPattern, PATTERNS } from '../patterns';
import { DAY_MS, makeCtx, NOW } from './helpers';

describe('instantiatePattern', () => {
	const ctx = makeCtx({ diagnosis: { whoIsAffected: 'residents of the northern district' } });
	const byActivity = (plan: ReturnType<typeof instantiatePattern>, tempId: string) =>
		plan.scheduledActions.filter((action) => action.activityTempId === tempId);

	it('produces a valid StudioPlan for every pattern', () => {
		for (const pattern of PATTERNS) {
			const plan = instantiatePattern(pattern, ctx);
			const parsed = safeParse(StudioPlanSchema, plan);
			expect(parsed.success, pattern.patternId).toBe(true);
		}
	});

	it('assigns tempIds a1.., order, roles and survey defaults', () => {
		const plan = instantiatePattern(getPattern('questionFirstAgreement')!, ctx);
		expect(plan.activities.map((activity) => activity.tempId)).toEqual(['a1', 'a2', 'a3', 'a4']);
		expect(plan.activities.map((activity) => activity.order)).toEqual([0, 1, 2, 3]);
		expect(plan.activities.map((activity) => activity.role)).toEqual(['widen', 'comment', 'comment', 'decide']);
		expect(plan.activities[0].survey?.allowParticipantsToAddSuggestions).toBe(true);
		expect(plan.activities[0].survey?.askUserForASolutionBeforeEvaluation).toBe(true);
		expect(plan.activities[1].survey).toBeUndefined();
		expect(plan.activities.every((activity) => activity.change === 'add')).toBe(true);
	});

	it('fills the topic slot from whoIsAffected', () => {
		const plan = instantiatePattern(getPattern('questionFirstAgreement')!, ctx);
		expect(plan.activities[0].title).toContain('residents of the northern district');
		expect(plan.activities[1].draftIntent).toContain('residents of the northern district');
		expect(plan.mainQuestion.title).toContain(ctx.organizationName);
	});

	it('schedules dates in the future with atLocal ISO strings carrying an offset', () => {
		const plan = instantiatePattern(getPattern('questionFirstAgreement')!, ctx);
		expect(plan.scheduledActions.length).toBeGreaterThan(0);
		for (const action of plan.scheduledActions) {
			expect(action.at).toBeGreaterThan(NOW);
			expect(action.atLocal).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
			expect(Date.parse(action.atLocal!)).toBe(action.at);
		}
	});

	it('a drafted document is hidden, drafted 1h after its source closes, opened 2 days later, then closed', () => {
		const plan = instantiatePattern(getPattern('questionFirstAgreement')!, ctx);
		const survey = byActivity(plan, 'a1');
		expect(survey.map((action) => action.action)).toEqual(['nudge', 'close']);
		expect(survey[0].at).toBeLessThan(survey[1].at);
		expect(survey[0].nudgeMessage?.length).toBeGreaterThan(0);

		const document = plan.activities[1];
		expect(document).toMatchObject({ type: 'document', openNow: false, draftFrom: ['a1'], draftCutoff: DEFAULT_DRAFT_CUTOFF });
		const docActions = byActivity(plan, 'a2');
		expect(docActions.map((action) => action.action)).toEqual(['draft', 'open', 'nudge', 'close']);
		const [draft, open, , close] = docActions;
		expect(draft.draftFrom).toEqual(['a1']);
		expect(draft.at).toBe(survey[1].at + HOUR_MS);
		expect(open.at).toBeGreaterThan(draft.at);
		expect(Math.round((open.at - draft.at) / DAY_MS)).toBe(DRAFT_REVIEW_DAYS);
		expect(close.at).toBeGreaterThan(open.at);

		const revise = plan.activities[2];
		expect(revise.draftFrom).toEqual(['a2']);
		expect(byActivity(plan, 'a3')[0].at).toBe(close.at + HOUR_MS);

		const decide = byActivity(plan, 'a4');
		expect(decide.map((action) => action.action)).toEqual(['open', 'close']);
		expect(decide[0].at).toBeGreaterThan(byActivity(plan, 'a3')[3].at);
	});

	it('skips the second comment round when the horizon is under three weeks', () => {
		const plan = instantiatePattern(getPattern('questionFirstAgreement')!, makeCtx({ diagnosis: { timeHorizonDays: 14 } }));
		expect(plan.activities.map((activity) => activity.role)).toEqual(['widen', 'comment', 'decide']);
	});

	it('draft-first: the text opens now, one room per segment, the revision is drafted from all rooms', () => {
		const plan = instantiatePattern(
			getPattern('draftFirstAgreement')!,
			makeCtx({ diagnosis: { hasDraft: 'text', audienceSegments: ['members', 'youth'] } }),
		);
		expect(plan.activities.map((activity) => activity.type)).toEqual(['document', 'liveSession', 'liveSession', 'document', 'discussion']);
		expect(plan.activities[0]).toMatchObject({ openNow: true });
		expect(plan.activities[0].draftFrom).toBeUndefined();
		expect(plan.activities[1].description).toContain('members');
		expect(plan.activities[2].description).toContain('youth');
		expect(byActivity(plan, 'a3')[0].at).toBeGreaterThan(byActivity(plan, 'a2')[0].at);
		expect(plan.activities[3].draftFrom).toEqual(['a2', 'a3']);
		const draft = byActivity(plan, 'a4').find((action) => action.action === 'draft')!;
		expect(draft.at).toBeGreaterThan(byActivity(plan, 'a3')[0].at);
		expect(byActivity(plan, 'a4').find((action) => action.action === 'open')!.at).toBeGreaterThan(draft.at);
	});

	it('draft-first without segments runs a single room', () => {
		const plan = instantiatePattern(getPattern('draftFirstAgreement')!, makeCtx({ diagnosis: { hasDraft: 'text' } }));
		expect(plan.activities.filter((activity) => activity.type === 'liveSession')).toHaveLength(1);
		expect(plan.activities[1].description).toContain('the whole community');
	});

	it('material-first in existing mode drafts from the existing activities (tomorrow) and skips the room without a facilitator', () => {
		const plan = instantiatePattern(
			getPattern('materialFirstAgreement')!,
			makeCtx({
				mode: 'existing',
				existingActivities: [{ statementId: 'st1', type: 'crowdSurvey', title: 'What?', order: 0 }],
				diagnosis: { hasDraft: 'material', facilitationCapacity: 'none' },
			}),
		);
		expect(plan.activities.map((activity) => activity.type)).toEqual(['document', 'document', 'discussion']);
		expect(plan.activities[0].draftFrom).toEqual(['st1']);
		const draft = byActivity(plan, 'a1')[0];
		expect(draft.action).toBe('draft');
		expect(draft.at).toBeGreaterThan(NOW);
		expect(draft.at).toBeLessThan(NOW + 2 * DAY_MS);
		expect(plan.activities[1].draftFrom).toEqual(['a1']);
	});

	it('quickPulse has a single activity with nudge on day 3 and close on day 5', () => {
		const plan = instantiatePattern(getPattern('quickPulse')!, ctx);
		expect(plan.activities).toHaveLength(1);
		expect(plan.scheduledActions.map((action) => action.action)).toEqual(['nudge', 'close']);
		const dayDiff = (plan.scheduledActions[1].at - plan.scheduledActions[0].at) / DAY_MS;
		expect(Math.round(dayDiff)).toBe(2);
	});
});

describe('fillTemplate', () => {
	it('falls back to a decision-type topic, then a generic one', () => {
		expect(fillTemplate('{{topic}}', makeCtx({ diagnosis: { decisionType: 'allocate' } }))).toBe('the budget');
		expect(fillTemplate('{{topic}}', makeCtx())).toBe('our shared challenge');
		expect(fillTemplate('{{organization}}', makeCtx())).toBe('Northern District Council');
		expect(fillTemplate('{{segment}}', makeCtx(), 'youth')).toBe('youth');
	});
});
