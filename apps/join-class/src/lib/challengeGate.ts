import type { LessonStepKey, Statement } from '@freedi/shared-types';
import { getChallengeQuestion } from './lessonCore';

/**
 * The Proposals question rule: a lesson may be saved as a draft without it, but
 * it cannot be STARTED (the teacher cannot leave the Waiting step) until one
 * sub-question carries `classRole: 'challenge'`. Pure, so the plan screen, the
 * console and the tests share one answer.
 */

/** True when the lesson has a Proposals (challenge) question. */
export function hasChallengeQuestion(questions: readonly Statement[]): boolean {
	return getChallengeQuestion(questions) !== null;
}

/** The step that, once left, means the class has started. */
const START_STEP: LessonStepKey = 'waiting';

/**
 * True when moving from `fromIndex` to `toIndex` would start the lesson
 * (leave Waiting going forward) and there is no Proposals question yet.
 */
export function isStartBlockedByMissingChallenge(
	questions: readonly Statement[],
	steps: readonly LessonStepKey[],
	fromIndex: number,
	toIndex: number,
): boolean {
	if (steps[fromIndex] !== START_STEP || toIndex <= fromIndex) return false;

	return !hasChallengeQuestion(questions);
}
