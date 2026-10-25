import type { ClassBallot, Statement } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';
import { lessonStepOf } from './lessonStatusGuard';

/**
 * Pure logic behind `classResetVote` (IA 18.4).
 */

/**
 * Whether the class may still be voting right now: the ballot is open, not
 * paused, and the lesson stands on the Vote step. A paused vote is not running,
 * so the teacher may reset it.
 */
export function isVoteRunning(
	ballot: ClassBallot | undefined,
	main: Statement | null | undefined,
): boolean {
	if (!ballot || typeof ballot.closedAt === 'number') return false;
	if (typeof ballot.pausedAt === 'number') return false;

	return lessonStepOf(main) === 'vote';
}

/** Throws the refusal that applies, or nothing when the vote may be reset. */
export function assertVoteResettable(
	ballot: ClassBallot | undefined,
	main: Statement | null | undefined,
): asserts ballot is ClassBallot {
	if (!ballot) {
		throw new ClassroomError('failed-precondition', 'The vote has not been opened', 'no-ballot');
	}
	if (isVoteRunning(ballot, main)) {
		throw new ClassroomError(
			'failed-precondition',
			'Close the vote before resetting it',
			'vote-running',
		);
	}
}

/** The ballot after a reset: same candidates, same freeze, no close and no decision. */
export function ballotAfterReset(ballot: ClassBallot): ClassBallot {
	return { candidateIds: [...ballot.candidateIds], frozenAt: ballot.frozenAt };
}
