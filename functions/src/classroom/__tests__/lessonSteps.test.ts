import type { Statement } from '@freedi/shared-types';
import { lessonStepOf } from '../lessonStatusGuard';
import { isVoteRunning } from '../resetVoteLogic';
import { LESSON_STEPS } from '../cloneLesson';

/**
 * IA 19.8: the engine reads a lesson's step from its OWN stored steps
 * (`steps[stepIndex]`), so a lesson stored with 8 steps (before "כל ההצעות")
 * sitting at Vote (index 6) stays at Vote, and a new 9-step lesson at index 6 is
 * at "כל ההצעות".
 */

const OLD_STEPS = [
	'waiting',
	'opening',
	'side',
	'tables',
	'tableTalk',
	'proposals',
	'vote',
	'summary',
];
const OPEN_BALLOT = { candidateIds: ['p1'], frozenAt: 1 };

function mainAt(steps: readonly string[], stepIndex: number): Statement {
	return {
		statementSettings: { lessonPlan: { steps: [...steps], stepIndex } },
	} as unknown as Statement;
}

describe('lesson steps in the engine', () => {
	it('a new lesson has 9 steps with allProposals before vote', () => {
		expect(LESSON_STEPS).toHaveLength(9);
		expect(LESSON_STEPS.indexOf('allProposals')).toBe(LESSON_STEPS.indexOf('vote') - 1);
	});

	it('an old 8-step lesson at index 6 is at Vote', () => {
		expect(lessonStepOf(mainAt(OLD_STEPS, 6))).toBe('vote');
		expect(isVoteRunning(OPEN_BALLOT, mainAt(OLD_STEPS, 6))).toBe(true);
	});

	it('a new lesson at index 6 is at All proposals, and the vote is not running there', () => {
		expect(lessonStepOf(mainAt(LESSON_STEPS, 6))).toBe('allProposals');
		expect(isVoteRunning(OPEN_BALLOT, mainAt(LESSON_STEPS, 6))).toBe(false);
		expect(lessonStepOf(mainAt(LESSON_STEPS, 7))).toBe('vote');
	});
});
