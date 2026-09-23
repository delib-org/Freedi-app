import { describe, expect, it } from 'vitest';
import {
	AgoraSessionStatus,
	AgoraStage,
	stagePlanPreset,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';
import { canWritePlanItem, canWriteStage } from '../flows/stageAccess';

const plan: AgoraStagePlanItem[] = stagePlanPreset('wizcol');
// lobby, story, needs, deliberation, voting, results

describe('late-arrival participation', () => {
	it('allows writing in each earlier question while the class deliberates or votes', () => {
		for (const currentIndex of [3, 4]) {
			expect(canWritePlanItem(plan, currentIndex, 1)).toBe(true);
			expect(canWritePlanItem(plan, currentIndex, 2)).toBe(true);
		}
	});

	it('keeps future and missing stations closed', () => {
		expect(canWritePlanItem(plan, 1, 2)).toBe(false);
		expect(canWritePlanItem(plan, 3, -1)).toBe(false);
		expect(canWritePlanItem(plan, 99, 1)).toBe(false);
	});

	it('does not reopen proposals after the ballot opens or finished-session questions', () => {
		expect(canWritePlanItem(plan, 3, 3)).toBe(true);
		expect(canWritePlanItem(plan, 4, 3)).toBe(false);
		expect(canWritePlanItem(plan, 4, 4)).toBe(false);
		expect(canWritePlanItem(plan, 5, 1)).toBe(false);
	});

	it('handles ordinary questions and repeated question IDs independently', () => {
		const questions: AgoraStagePlanItem[] = [
			{ itemId: 'first', stage: AgoraStage.question },
			{ itemId: 'second', stage: AgoraStage.question },
		];
		expect(canWritePlanItem(questions, 1, 0)).toBe(true);
		expect(canWritePlanItem(questions, 0, 1)).toBe(false);
	});

	it('uses the session status as well as its plan and supports legacy sessions', () => {
		const session = { stage: AgoraStage.deliberation, stagePlan: plan, stageIndex: 3 };
		expect(canWriteStage({ ...session, status: AgoraSessionStatus.live }, 'round-story')).toBe(
			true,
		);
		expect(canWriteStage({ ...session, status: AgoraSessionStatus.ended }, 'round-story')).toBe(
			false,
		);
		expect(canWriteStage({ ...session, status: AgoraSessionStatus.live }, 'missing')).toBe(false);
		expect(
			canWriteStage(
				{ stage: AgoraStage.deliberation, status: AgoraSessionStatus.open },
				'deliberation',
			),
		).toBe(true);
	});
});
