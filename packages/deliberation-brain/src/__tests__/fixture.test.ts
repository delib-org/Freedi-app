import { describe, expect, it } from 'vitest';
import { safeParse } from 'valibot';
import { DEFAULT_DRAFT_CUTOFF, StudioPlanSchema } from '@freedi/shared-types';
import { buildFixtureResponse } from '../fixture';
import { critiquePlan } from '../critic';
import { makeCtx, NOW } from './helpers';

describe('buildFixtureResponse', () => {
	it('turn 0 → question-first plan + clarifying question, not ready', () => {
		const out = buildFixtureResponse(makeCtx({ userTurns: 0 }), 'We need to decide what to do with the old school');
		expect(out.readyToBuild).toBe(false);
		expect(out.patternId).toBe('questionFirstAgreement');
		expect(out.reply).toMatch(/\?$/);
		expect(out.reply).toContain('old school');
		expect(safeParse(StudioPlanSchema, out.plan).success).toBe(true);
		expect(out.diagnosis.hasDraft).toBe('nothing');

		expect(out.plan.activities.map((activity) => activity.type)).toEqual(['crowdSurvey', 'document', 'discussion']);
		expect(out.plan.activities.map((activity) => activity.role)).toEqual(['widen', 'comment', 'decide']);
		expect(out.plan.activities[0].openNow).toBe(true);
		expect(out.plan.activities[1]).toMatchObject({ openNow: false, draftFrom: ['a1'], draftCutoff: DEFAULT_DRAFT_CUTOFF });
		const docActions = out.plan.scheduledActions.filter((action) => action.activityTempId === 'a2');
		expect(docActions.map((action) => action.action)).toEqual(['draft', 'open', 'nudge', 'close']);
		expect(docActions[0].at).toBeLessThan(docActions[1].at);
	});

	it('later turns → same plan, ready to build, passes the critic without problems', () => {
		const first = buildFixtureResponse(makeCtx({ userTurns: 0 }), 'hello');
		const later = buildFixtureResponse(makeCtx({ userTurns: 2 }), 'looks good');
		expect(later.readyToBuild).toBe(true);
		expect(later.plan.activities).toEqual(first.plan.activities);
		expect(later.reply).toMatch(/Shall I build/);
		const report = critiquePlan(later.plan, { now: NOW, diagnosis: later.diagnosis });
		expect(report).toEqual({ problems: [], blocking: false });
	});

	it('replies in Hebrew when languageName is Hebrew', () => {
		const out = buildFixtureResponse(makeCtx({ languageName: 'Hebrew', userTurns: 1 }), 'שלום');
		expect(out.reply).toMatch(/[֐-׿]/);
		expect(out.reply).not.toMatch(/Shall I build/);
	});

	it('existing mode keeps every existing row and adds one document drafted from the first existing activity', () => {
		const out = buildFixtureResponse(
			makeCtx({
				mode: 'existing',
				userTurns: 1,
				existingActivities: [
					{ statementId: 'st1', type: 'crowdSurvey', title: 'What is our goal?', order: 0, status: 'live' },
					{ statementId: 'st2', type: 'liveSession', title: 'Which options?', order: 1, status: 'frozen' },
				],
			}),
			'write it up',
		);
		expect(safeParse(StudioPlanSchema, out.plan).success).toBe(true);
		expect(out.plan.activities).toHaveLength(3);
		expect(out.plan.activities[0]).toMatchObject({ change: 'keep', existingStatementId: 'st1', openNow: true });
		expect(out.plan.activities[1]).toMatchObject({ change: 'keep', existingStatementId: 'st2', openNow: false });
		expect(out.plan.activities[2]).toMatchObject({
			change: 'add',
			type: 'document',
			tempId: 'a1',
			order: 2,
			openNow: false,
			draftFrom: ['st1'],
			draftCutoff: DEFAULT_DRAFT_CUTOFF,
		});
		expect(out.plan.scheduledActions.every((action) => action.activityTempId === 'a1')).toBe(true);
		expect(out.plan.scheduledActions.map((action) => action.action)).toEqual(['draft', 'open', 'nudge', 'close']);
		expect(out.plan.scheduledActions[0].draftFrom).toEqual(['st1']);
		expect(out.plan.scheduledActions[0].at).toBeGreaterThan(NOW);
		expect(critiquePlan(out.plan, { now: NOW }).blocking).toBe(false);
	});
});
