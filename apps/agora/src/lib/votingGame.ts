import {
	AgoraSession,
	ChallengePhase,
	ChallengeOutcome,
	VotingCandidate,
	VotingGameState,
} from '@freedi/shared-types';
import { challengeTurn, ChallengeAction } from './callables';
import { trackWrite } from './confirmedWrite';

/**
 * The challenge round's client side.
 *
 * There are no listeners here, and that is the point: the turn state rides on
 * the session document, which every phone already holds a snapshot on. One
 * write from the server moves the whole room in the same beat — a separate
 * subscription would only add a way for two students to be in different turns.
 *
 * Nothing in this file decides anything either. Every move is a callable, so
 * the rule that a turn is legal lives on the server where the class cannot
 * disagree with it, and this module's job is to name the moves and to be
 * honest about whether one landed.
 */

export function getGame(session: AgoraSession): VotingGameState | null {
	return session.votingGame ?? null;
}

/** Whether the round is live at all — the teacher may never have switched it on. */
export function isChallengeEnabled(session: AgoraSession): boolean {
	return session.votingSettings?.challengeGame === true;
}

/** Is the challenge in the phase where the room may move its votes? */
export function isChallengeVoteOpen(session: AgoraSession): boolean {
	return session.votingGame?.phase === ChallengePhase.vote;
}

export function isMySpeakerTurn(session: AgoraSession, userId: string): boolean {
	const game = session.votingGame;

	return (
		game?.speakerUserId === userId &&
		(game.phase === ChallengePhase.floor || game.phase === ChallengePhase.idle)
	);
}

/** Do I have the floor right now, with the desk open? */
export function canPitchNow(session: AgoraSession, userId: string): boolean {
	const game = session.votingGame;

	return game?.phase === ChallengePhase.floor && game.speakerUserId === userId;
}

/**
 * The challenger as the ballot should render it. Its consensus is zero and
 * says so — nobody has rated it, and pretending otherwise would put a number
 * next to it that no student produced.
 */
export function challengerCandidate(session: AgoraSession): VotingCandidate | null {
	const game = session.votingGame;
	if (!game?.challengerStatementId) return null;

	return {
		statementId: game.challengerStatementId,
		statement: game.challengerStatement ?? '',
		consensus: 0,
	};
}

export function lastOutcome(session: AgoraSession): ChallengeOutcome | null {
	return session.votingGame?.lastOutcome ?? null;
}

/** Who is up after the student on the floor — the roster's "you are next" line. */
export function nextSpeakerName(session: AgoraSession): string | null {
	const game = session.votingGame;
	if (!game) return null;
	const upcoming = game.turnIndex + 1;
	if (upcoming >= game.order.length || upcoming >= game.maxTurns) return null;

	return game.orderNames[upcoming] ?? null;
}

/**
 * Turns still to come, the cap included. The teacher's card turns this into
 * minutes; nothing else should, because a student watching a countdown of
 * other people's turns is being told to stop listening.
 */
export function turnsRemaining(session: AgoraSession): number {
	const game = session.votingGame;
	if (!game) return 0;

	return Math.max(0, Math.min(game.order.length, game.maxTurns) - game.turnIndex - 1);
}

/**
 * One door for every move.
 *
 * `trackWrite` wraps it because a callable can hang exactly as a write can, and
 * a teacher tapping "Close and resolve" into a dead network deserves to be told
 * so rather than to watch a screen that never changes.
 */
async function move(
	labelKey: string,
	sessionId: string,
	action: ChallengeAction,
	text?: string,
): Promise<ChallengeOutcome | undefined> {
	const response = await trackWrite(
		labelKey,
		challengeTurn({ sessionId, action, ...(text === undefined ? {} : { text }) }),
	);

	return response.outcome;
}

export function startRound(sessionId: string): Promise<ChallengeOutcome | undefined> {
	return move('votingGame.saving_turn', sessionId, 'start');
}

export function openFloor(sessionId: string): Promise<ChallengeOutcome | undefined> {
	return move('votingGame.saving_turn', sessionId, 'openFloor');
}

export function pitchChallenger(
	sessionId: string,
	text: string,
): Promise<ChallengeOutcome | undefined> {
	return move('votingGame.saving_pitch', sessionId, 'pitch', text);
}

export function passTurn(sessionId: string): Promise<ChallengeOutcome | undefined> {
	return move('votingGame.saving_turn', sessionId, 'pass');
}

export function openChallengeVote(sessionId: string): Promise<ChallengeOutcome | undefined> {
	return move('votingGame.saving_turn', sessionId, 'openVote');
}

export function resolveChallengeTurn(sessionId: string): Promise<ChallengeOutcome | undefined> {
	return move('votingGame.saving_turn', sessionId, 'resolve');
}

export function skipSpeaker(sessionId: string): Promise<ChallengeOutcome | undefined> {
	return move('votingGame.saving_turn', sessionId, 'skip');
}

export function nextSpeaker(sessionId: string): Promise<ChallengeOutcome | undefined> {
	return move('votingGame.saving_turn', sessionId, 'next');
}

export function endRound(sessionId: string): Promise<ChallengeOutcome | undefined> {
	return move('votingGame.saving_turn', sessionId, 'end');
}
