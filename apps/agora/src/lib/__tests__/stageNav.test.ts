import { describe, expect, it } from 'vitest';
import { AgoraStage, stagePlanPreset, type AgoraStagePlanItem } from '@freedi/shared-types';
import {
	INITIAL_STAGE_NAV,
	effectiveIndex,
	serializeStageNav,
	stageNavReduce,
} from '../flows/stageNav';

const plan: AgoraStagePlanItem[] = [
	...stagePlanPreset('quickDecision'),
	{ itemId: AgoraStage.ended, stage: AgoraStage.ended },
];
// lobby(0) question-1(1) deliberation(2) voting(3) results(4) ended(5)

describe('stageNavReduce', () => {
	it('steps back to an opened stage', () => {
		const state = stageNavReduce(
			INITIAL_STAGE_NAV,
			{ kind: 'select', itemId: 'question-1' },
			plan,
			2,
		);

		expect(state.viewingItemId).toBe('question-1');
		expect(effectiveIndex(plan, 2, state.viewingItemId)).toBe(1);
	});

	it('refuses a stage not yet opened', () => {
		const state = stageNavReduce(INITIAL_STAGE_NAV, { kind: 'select', itemId: 'voting' }, plan, 2);

		expect(state).toBe(INITIAL_STAGE_NAV);
		expect(effectiveIndex(plan, 2, state.viewingItemId)).toBe(2);
	});

	it('selecting the current stage means "back to now"', () => {
		const back = stageNavReduce(
			{ viewingItemId: 'question-1' },
			{ kind: 'select', itemId: 'deliberation' },
			plan,
			2,
		);

		expect(back.viewingItemId).toBeNull();
	});

	it('is carried forward when the room advances', () => {
		const state = stageNavReduce(
			{ viewingItemId: 'question-1' },
			{ kind: 'session-advanced' },
			plan,
			3,
		);

		expect(state.viewingItemId).toBeNull();
	});

	it('restores only what is still valid', () => {
		expect(
			stageNavReduce(INITIAL_STAGE_NAV, { kind: 'restore', raw: 'question-1' }, plan, 2)
				.viewingItemId,
		).toBe('question-1');
		expect(
			stageNavReduce(INITIAL_STAGE_NAV, { kind: 'restore', raw: 'voting' }, plan, 2).viewingItemId,
		).toBeNull();
		expect(
			stageNavReduce(INITIAL_STAGE_NAV, { kind: 'restore', raw: 'garbage' }, plan, 2).viewingItemId,
		).toBeNull();
		expect(stageNavReduce(INITIAL_STAGE_NAV, { kind: 'restore', raw: null }, plan, 2)).toBe(
			INITIAL_STAGE_NAV,
		);
	});

	it('a stale choice falls back to the current stage without touching state', () => {
		expect(effectiveIndex(plan, 2, 'nope')).toBe(2);
	});

	it('round-trips through the storage string', () => {
		expect(serializeStageNav({ viewingItemId: 'question-1' })).toBe('question-1');
		expect(serializeStageNav(INITIAL_STAGE_NAV)).toBe('');
	});
});
