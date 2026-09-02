import { describe, it, expect } from 'vitest';
import type { StudioPlan } from '@freedi/shared-types';
import { computeChangedTempIds } from '../planDiff';

function plan(overrides: Partial<StudioPlan> = {}): StudioPlan {
	return {
		mainQuestion: { title: 'How should we spend the budget?' },
		activities: [
			{
				tempId: 'a1',
				type: 'crowdSurvey',
				title: 'Ideas',
				order: 0,
				openNow: true,
				change: 'add',
			},
			{
				tempId: 'a2',
				type: 'liveSession',
				title: 'Town hall',
				order: 1,
				openNow: false,
				change: 'add',
			},
		],
		scheduledActions: [{ tempId: 's1', activityTempId: 'a2', action: 'open', at: 1_000 }],
		summary: 'Widen, then decide.',
		...overrides,
	};
}

describe('computeChangedTempIds', () => {
	it('flashes nothing for the first plan or when a plan is missing', () => {
		expect(computeChangedTempIds(undefined, plan())).toEqual([]);
		expect(computeChangedTempIds(plan(), undefined)).toEqual([]);
		expect(computeChangedTempIds(null, null)).toEqual([]);
	});

	it('returns nothing for an identical plan (new object identity)', () => {
		expect(computeChangedTempIds(plan(), plan())).toEqual([]);
	});

	it('reports edited activities, new activities and edited scheduled actions', () => {
		const before = plan();
		const after = plan({
			activities: [
				{ ...before.activities[0], title: 'Ideas from residents' },
				before.activities[1],
				{
					tempId: 'a3',
					type: 'discussion',
					title: 'Deep dive',
					order: 2,
					openNow: false,
					change: 'add',
				},
			],
			scheduledActions: [{ tempId: 's1', activityTempId: 'a2', action: 'open', at: 2_000 }],
		});

		expect(computeChangedTempIds(before, after)).toEqual(['a1', 'a3', 's1']);
	});

	it('treats a survey config change as a change', () => {
		const before = plan();
		const after = plan({
			activities: [
				{ ...before.activities[0], survey: { allowParticipantsToAddSuggestions: false } },
				before.activities[1],
			],
		});

		expect(computeChangedTempIds(before, after)).toEqual(['a1']);
	});

	it('ignores removed rows (nothing left to flash)', () => {
		const before = plan();
		const after = plan({ activities: [before.activities[0]], scheduledActions: [] });

		expect(computeChangedTempIds(before, after)).toEqual([]);
	});
});
