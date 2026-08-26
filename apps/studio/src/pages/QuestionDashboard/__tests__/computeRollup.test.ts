import { describe, expect, it } from 'vitest';
import { ActivityType, getActivityDef } from '@freedi/shared-types';
import type { ActivityRunState, DerivedActivity } from '@freedi/event-core';
import { computeRollup } from '../useQuestionDashboardData';

function activity(runState: ActivityRunState, id: string = runState): DerivedActivity {
	return {
		statementId: id,
		title: id,
		order: 0,
		type: ActivityType.question,
		def: getActivityDef(ActivityType.question),
		runState,
		participant: null,
		admin: null,
	};
}

describe('computeRollup', () => {
	it('is queued when there are no activities', () => {
		expect(computeRollup([])).toEqual({ state: 'queued', openCount: 0, total: 0 });
	});

	it('is open when any activity is open, counting the open ones', () => {
		const rollup = computeRollup([
			activity('open', 'a'),
			activity('closed', 'b'),
			activity('open', 'c'),
		]);
		expect(rollup).toEqual({ state: 'open', openCount: 2, total: 3 });
	});

	it('is frozen when nothing is open but something is frozen', () => {
		expect(computeRollup([activity('frozen'), activity('closed')]).state).toBe('frozen');
	});

	it('is closed only when every activity is closed', () => {
		expect(computeRollup([activity('closed', 'a'), activity('closed', 'b')]).state).toBe('closed');
		expect(computeRollup([activity('closed'), activity('queued')]).state).toBe('queued');
	});
});
