import { describe, expect, it } from 'vitest';
import { computeProposalDiff, plansEqual } from '../learning';
import { action, activity, DAY_MS, NOW, plan } from './helpers';

describe('plansEqual', () => {
	it('ignores atLocal and key order', () => {
		const a = plan({ scheduledActions: [action({ tempId: 's1', atLocal: '2030-01-01T10:00:00+02:00' })] });
		const b = plan({ scheduledActions: [{ ...action({ tempId: 's1' }), atLocal: 'different' }] });
		expect(plansEqual(a, b)).toBe(true);
		expect(plansEqual(a, plan({ summary: 'changed' }))).toBe(false);
		expect(plansEqual(undefined, undefined)).toBe(true);
		expect(plansEqual(a, undefined)).toBe(false);
	});
});

describe('computeProposalDiff', () => {
	const proposed = plan({
		activities: [
			activity({ tempId: 'a1', role: 'widen' }),
			activity({ tempId: 'a2', type: 'discussion', title: 'What do we decide?', order: 1 }),
			activity({ tempId: 'a3', type: 'liveSession', title: 'Which ideas unite us?', order: 2 }),
		],
		scheduledActions: [action({ tempId: 's1' }), action({ tempId: 's2', action: 'nudge', nudgeMessage: 'Go!' })],
	});

	it('counts added, removed, edited activities and changed actions', () => {
		const built = plan({
			activities: [
				activity({ tempId: 'a1', role: 'widen', title: 'What should we fix first?' }),
				activity({ tempId: 'a2', type: 'discussion', title: 'What do we decide?', order: 1 }),
				activity({ tempId: 'a4', type: 'discussion', title: 'Who owns it?', order: 2 }),
			],
			scheduledActions: [action({ tempId: 's1', at: NOW + 20 * DAY_MS }), action({ tempId: 's3' })],
			mainQuestion: { title: 'How should we improve the park?', description: 'added' },
		});
		expect(computeProposalDiff(proposed, built)).toEqual({
			activitiesAdded: 1,
			activitiesRemoved: 1,
			activitiesEdited: 1,
			actionsChanged: 3,
			mainQuestionEdited: true,
		});
	});

	it('is all zeros for identical plans and treats undefined as empty', () => {
		expect(computeProposalDiff(proposed, proposed)).toEqual({
			activitiesAdded: 0,
			activitiesRemoved: 0,
			activitiesEdited: 0,
			actionsChanged: 0,
			mainQuestionEdited: false,
		});
		expect(computeProposalDiff(undefined, proposed).activitiesAdded).toBe(3);
		expect(computeProposalDiff(proposed, undefined).activitiesRemoved).toBe(3);
	});
});
