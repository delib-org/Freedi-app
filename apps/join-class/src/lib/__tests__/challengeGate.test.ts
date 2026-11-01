import { describe, expect, it } from 'vitest';
import type { LessonStepKey, Statement } from '@freedi/shared-types';
import { hasChallengeQuestion, isStartBlockedByMissingChallenge } from '../challengeGate';

function question(id: string, classRole?: 'guiding' | 'challenge'): Statement {
	return { statementId: id, statementSettings: { classRole } } as unknown as Statement;
}

const STEPS: LessonStepKey[] = ['waiting', 'opening', 'side', 'proposals', 'vote'];

describe('hasChallengeQuestion', () => {
	it('is false with no questions', () => {
		expect(hasChallengeQuestion([])).toBe(false);
	});

	it('is false when every question is guiding or has no role', () => {
		expect(hasChallengeQuestion([question('a', 'guiding'), question('b')])).toBe(false);
	});

	it('is true when one question is the challenge', () => {
		expect(hasChallengeQuestion([question('a', 'guiding'), question('b', 'challenge')])).toBe(true);
	});
});

describe('isStartBlockedByMissingChallenge', () => {
	const none = [question('a', 'guiding')];
	const some = [question('a', 'guiding'), question('b', 'challenge')];

	it('blocks leaving Waiting without a Proposals question', () => {
		expect(isStartBlockedByMissingChallenge(none, STEPS, 0, 1)).toBe(true);
		expect(isStartBlockedByMissingChallenge(none, STEPS, 0, 3)).toBe(true);
	});

	it('lets the lesson start once the Proposals question exists', () => {
		expect(isStartBlockedByMissingChallenge(some, STEPS, 0, 1)).toBe(false);
	});

	it('does not block moves after the start (the live prompt handles those)', () => {
		expect(isStartBlockedByMissingChallenge(none, STEPS, 1, 2)).toBe(false);
		expect(isStartBlockedByMissingChallenge(none, STEPS, 2, 1)).toBe(false);
	});

	it('does not block staying on Waiting', () => {
		expect(isStartBlockedByMissingChallenge(none, STEPS, 0, 0)).toBe(false);
	});
});
