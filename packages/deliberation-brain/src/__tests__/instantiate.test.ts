import { describe, expect, it } from 'vitest';
import { safeParse } from 'valibot';
import { StudioPlanSchema } from '@freedi/shared-types';
import { instantiatePattern, fillTemplate } from '../instantiate';
import { getPattern, PATTERNS } from '../patterns';
import { makeCtx, NOW } from './helpers';

describe('instantiatePattern', () => {
	const ctx = makeCtx({ diagnosis: { whoIsAffected: 'residents of the northern district' } });

	it('produces a valid StudioPlan for every pattern', () => {
		for (const pattern of PATTERNS) {
			const plan = instantiatePattern(pattern, ctx);
			const parsed = safeParse(StudioPlanSchema, plan);
			expect(parsed.success, pattern.patternId).toBe(true);
		}
	});

	it('assigns tempIds a1.., order, roles and survey defaults', () => {
		const plan = instantiatePattern(getPattern('widenConvergeDecide')!, ctx);
		expect(plan.activities.map((activity) => activity.tempId)).toEqual(['a1', 'a2', 'a3']);
		expect(plan.activities.map((activity) => activity.order)).toEqual([0, 1, 2]);
		expect(plan.activities.map((activity) => activity.role)).toEqual(['widen', 'converge', 'decide']);
		expect(plan.activities[0].survey?.allowParticipantsToAddSuggestions).toBe(true);
		expect(plan.activities[0].survey?.askUserForASolutionBeforeEvaluation).toBe(true);
		expect(plan.activities[1].survey).toBeUndefined();
		expect(plan.activities.every((activity) => activity.change === 'add')).toBe(true);
	});

	it('fills the topic slot from whoIsAffected', () => {
		const plan = instantiatePattern(getPattern('widenConvergeDecide')!, ctx);
		expect(plan.activities[0].title).toContain('residents of the northern district');
		expect(plan.mainQuestion.title).toContain(ctx.organizationName);
	});

	it('schedules dates in the future with atLocal ISO strings carrying an offset', () => {
		const plan = instantiatePattern(getPattern('widenConvergeDecide')!, ctx);
		expect(plan.scheduledActions.length).toBeGreaterThan(0);
		for (const action of plan.scheduledActions) {
			expect(action.at).toBeGreaterThan(NOW);
			expect(action.atLocal).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
			expect(Date.parse(action.atLocal!)).toBe(action.at);
		}
	});

	it('schedules open only for openNow=false activities, close at the end, nudge before close', () => {
		const plan = instantiatePattern(getPattern('widenConvergeDecide')!, ctx);
		const byActivity = (tempId: string) =>
			plan.scheduledActions.filter((action) => action.activityTempId === tempId);
		const survey = byActivity('a1');
		expect(survey.map((action) => action.action)).toEqual(['nudge', 'close']);
		expect(survey[0].at).toBeLessThan(survey[1].at);
		expect(survey[0].nudgeMessage?.length).toBeGreaterThan(0);

		const live = byActivity('a2');
		expect(live.map((action) => action.action)).toEqual(['open']);

		const decide = byActivity('a3');
		expect(decide.map((action) => action.action)).toEqual(['open', 'close']);
		expect(decide[0].at).toBeLessThan(decide[1].at);
	});

	it('quickPulse has a single activity with nudge on day 3 and close on day 5', () => {
		const plan = instantiatePattern(getPattern('quickPulse')!, ctx);
		expect(plan.activities).toHaveLength(1);
		expect(plan.scheduledActions.map((action) => action.action)).toEqual(['nudge', 'close']);
		const dayDiff = (plan.scheduledActions[1].at - plan.scheduledActions[0].at) / (24 * 60 * 60 * 1000);
		expect(Math.round(dayDiff)).toBe(2);
	});
});

describe('fillTemplate', () => {
	it('falls back to a decision-type topic, then a generic one', () => {
		expect(fillTemplate('{{topic}}', makeCtx({ diagnosis: { decisionType: 'allocate' } }))).toBe('the budget');
		expect(fillTemplate('{{topic}}', makeCtx())).toBe('our shared challenge');
		expect(fillTemplate('{{organization}}', makeCtx())).toBe('Northern District Council');
	});
});
