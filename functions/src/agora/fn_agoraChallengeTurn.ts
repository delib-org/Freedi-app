/**
 * The challenge round, one turn at a time.
 *
 * Every transition a class watches together goes through here, because each
 * one is a fact the whole room must agree on: who holds the floor, whether the
 * vote is open, and which option just lost its seat. The session doc carries
 * the answer and security rules freeze it, so the teacher's browser cannot
 * declare a winner the class voted down.
 *
 * The phase itself is the idempotency guard. A double-tapped "Close and
 * resolve" finds a phase that is no longer `vote` and is refused, which is why
 * no action here needs a nonce, a stamp, or a request id.
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraSession,
	AgoraStage,
	AgoraParticipant,
	ChallengePhase,
	ChallengeResolvedBy,
	ChallengeOutcome,
	VotingGameState,
	VotingCandidate,
	Vote,
	NO_VOTE,
	AGORA_CHALLENGE,
	AGORA_POINTS,
	AGORA_LIMITS,
	SourceApp,
	Statement,
	StatementType,
	User,
	createAgoraParticipantId,
	createStatementObject,
	resolveChallenge,
	seatOrder,
	tallyVotes,
	functionConfig,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

type ChallengeAction =
	| 'start'
	| 'openFloor'
	| 'pitch'
	| 'pass'
	| 'openVote'
	| 'resolve'
	| 'skip'
	| 'next'
	| 'end';

const TEACHER_ACTIONS: ReadonlySet<string> = new Set([
	'start',
	'openFloor',
	'openVote',
	'resolve',
	'skip',
	'next',
	'end',
]);

const SPEAKER_ACTIONS: ReadonlySet<string> = new Set(['pitch', 'pass']);

interface Request {
	sessionId: string;
	action: ChallengeAction;
	/** `pitch` only: the option the student is putting on the board */
	text?: string;
}

interface Result {
	phase: ChallengePhase;
	turnIndex: number;
	outcome?: ChallengeOutcome;
}

/**
 * One challenge per student per session. Deterministic so a retried pitch
 * overwrites rather than littering the question with near-duplicate options,
 * and distinct from `--proposal` so it cannot collide with the deliberation
 * draft the same student already wrote.
 */
function challengeStatementId(sessionId: string, uid: string): string {
	return `${sessionId}--${uid}--challenge`;
}

function anonCreator(uid: string, anonName: string): User {
	return { uid, displayName: anonName, email: null, photoURL: null, isAnonymous: true };
}

function sessionRef(sessionId: string) {
	return db.collection(Collections.agoraSessions).doc(sessionId);
}

/** The turn state, or a refusal — every action past `start` needs one to exist. */
function requireGame(session: AgoraSession): VotingGameState {
	const game = session.votingGame;
	if (!game) {
		throw new HttpsError('failed-precondition', 'The challenge round has not started');
	}

	return game;
}

function requirePhase(game: VotingGameState, ...allowed: ChallengePhase[]): void {
	if (!allowed.includes(game.phase)) {
		throw new HttpsError(
			'failed-precondition',
			`Cannot do that while the turn is "${game.phase}"`,
		);
	}
}

/**
 * A challenger that never faced a vote — passed over, skipped, or caught by
 * the teacher ending the round — leaves nothing behind. An orphan option would
 * otherwise reach the results board at consensus zero and drag the class's
 * average plausibility down for a proposal nobody ever saw.
 */
async function discardChallenger(game: VotingGameState): Promise<void> {
	if (!game.challengerStatementId) return;
	await db.collection(Collections.statements).doc(game.challengerStatementId).delete();
}

/** Conditional spreads throughout: a stray `undefined` rejects the whole write. */
function gamePatch(game: VotingGameState): Record<string, unknown> {
	return { votingGame: game, lastUpdate: Date.now() };
}

function clearedChallenger(game: VotingGameState): VotingGameState {
	const next = { ...game };
	delete next.challengerStatementId;
	delete next.challengerStatement;

	return next;
}

export const agoraChallengeTurn = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { sessionId, action, text } = request.data ?? {};
		if (!sessionId || !action) {
			throw new HttpsError('invalid-argument', 'sessionId and action are required');
		}
		if (!TEACHER_ACTIONS.has(action) && !SPEAKER_ACTIONS.has(action)) {
			throw new HttpsError('invalid-argument', `Unknown action "${action}"`);
		}

		try {
			const snap = await sessionRef(sessionId).get();
			if (!snap.exists) throw new HttpsError('not-found', 'Session not found');
			const session = snap.data() as AgoraSession;

			// The round exists only inside the vote. Outside it there is no board
			// to challenge.
			if (session.stage !== AgoraStage.voting) {
				throw new HttpsError('failed-precondition', 'The challenge only runs during the vote');
			}

			// The teacher's switch, enforced here rather than trusted from the
			// client. Hiding the button is a courtesy; this is the rule — and it
			// means switching the round off mid-vote stops it immediately.
			if (session.votingSettings?.challengeGame !== true) {
				throw new HttpsError(
					'failed-precondition',
					'Students may not add options to this ballot',
				);
			}

			if (TEACHER_ACTIONS.has(action) && session.teacherId !== uid) {
				throw new HttpsError('permission-denied', 'Only the teacher runs the challenge round');
			}
			if (SPEAKER_ACTIONS.has(action) && session.votingGame?.speakerUserId !== uid) {
				throw new HttpsError('permission-denied', 'Only the student holding the floor may do that');
			}

			switch (action) {
				case 'start':
					return await startRound(sessionId, session);
				case 'openFloor':
					return await openFloor(sessionId, session);
				case 'pitch':
					return await pitchChallenge(sessionId, session, uid, text ?? '');
				case 'pass':
					return await endTurnWithout(sessionId, session, ChallengeResolvedBy.pass);
				case 'openVote':
					return await openVote(sessionId, session);
				case 'resolve':
					return await resolveTurn(sessionId, session);
				case 'skip':
					return await endTurnWithout(sessionId, session, ChallengeResolvedBy.skip);
				case 'next':
					return await nextSpeaker(sessionId, session);
				case 'end':
					return await endRound(sessionId, session);
				default:
					throw new HttpsError('invalid-argument', `Unhandled action "${action}"`);
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.challengeTurn',
				userId: uid,
				metadata: { sessionId, action },
			});
			throw new HttpsError('internal', 'Failed to run the challenge turn');
		}
	},
);

/**
 * Freezes the rotation. Taken once, so a student joining halfway through
 * cannot reshuffle an order the class has already watched half of.
 */
async function startRound(sessionId: string, session: AgoraSession): Promise<Result> {
	if (session.votingGame && session.votingGame.phase !== ChallengePhase.ended) {
		throw new HttpsError('failed-precondition', 'The challenge round is already running');
	}

	const participantsSnap = await db
		.collection(Collections.agoraParticipants)
		.where('sessionId', '==', sessionId)
		.get();

	const seats = seatOrder(
		participantsSnap.docs.map((doc) => {
			const participant = doc.data() as AgoraParticipant;

			return {
				userId: participant.userId,
				anonName: participant.anonName,
				joinedAt: participant.joinedAt,
				isAI: participant.isAI,
			};
		}),
	);

	if (seats.length === 0) {
		throw new HttpsError('failed-precondition', 'Nobody is seated to take a turn');
	}

	const requested = session.votingSettings?.challengeMaxTurns;
	const maxTurns = Math.min(
		AGORA_CHALLENGE.MAX_TURNS_CEILING,
		Math.max(
			AGORA_CHALLENGE.MIN_MAX_TURNS,
			typeof requested === 'number' && Number.isFinite(requested)
				? Math.floor(requested)
				: AGORA_CHALLENGE.DEFAULT_MAX_TURNS,
		),
	);

	const now = Date.now();
	const game: VotingGameState = {
		order: seats.map((seat) => seat.userId),
		orderNames: seats.map((seat) => seat.anonName),
		turnIndex: 0,
		maxTurns,
		phase: ChallengePhase.idle,
		speakerUserId: seats[0].userId,
		speakerAnonName: seats[0].anonName,
		passedUserIds: [],
		skippedUserIds: [],
		startedAt: now,
		updatedAt: now,
	};

	await sessionRef(sessionId).update(gamePatch(game));

	return { phase: game.phase, turnIndex: game.turnIndex };
}

async function openFloor(sessionId: string, session: AgoraSession): Promise<Result> {
	const game = requireGame(session);
	requirePhase(game, ChallengePhase.idle);

	const next: VotingGameState = {
		...clearedChallenger(game),
		phase: ChallengePhase.floor,
		turnStartedAt: Date.now(),
		updatedAt: Date.now(),
	};
	await sessionRef(sessionId).update(gamePatch(next));

	return { phase: next.phase, turnIndex: next.turnIndex };
}

/**
 * The statement is written HERE, not by the phone that composed it.
 *
 * A client write followed by a callable that registers it is two steps that
 * can half-happen: if the second fails, an option nobody can see or vote on
 * sits under the question forever, and the results board counts it. One batch,
 * server-side, cannot come apart that way.
 */
async function pitchChallenge(
	sessionId: string,
	session: AgoraSession,
	uid: string,
	rawText: string,
): Promise<Result> {
	const game = requireGame(session);
	requirePhase(game, ChallengePhase.floor);

	const statementText = rawText.trim();
	if (statementText.length < AGORA_LIMITS.MIN_PROPOSAL_LENGTH) {
		throw new HttpsError('invalid-argument', 'That is too short to put to the class');
	}
	if (statementText.length > AGORA_LIMITS.MAX_PROPOSAL_LENGTH) {
		throw new HttpsError('invalid-argument', 'That is longer than a proposal may be');
	}

	const anonName = game.speakerAnonName ?? 'traveler';
	const statementId = challengeStatementId(sessionId, uid);
	const statement: Statement | undefined = createStatementObject({
		statementId,
		statement: statementText,
		statementType: StatementType.option,
		parentId: session.challengeQuestionId,
		topParentId: session.rootStatementId,
		parents: [session.rootStatementId, session.challengeQuestionId],
		creatorId: uid,
		creator: anonCreator(uid, anonName),
		sourceApp: SourceApp.AGORA,
		agoraSessionId: sessionId,
		anonName,
		agoraChallenge: true,
	});
	if (!statement) {
		throw new HttpsError('internal', 'Failed to build the challenge statement');
	}

	const next: VotingGameState = {
		...game,
		challengerStatementId: statementId,
		challengerStatement: statementText,
		updatedAt: Date.now(),
	};

	const batch = db.batch();
	// Merged rather than set outright: a retried pitch must overwrite its own
	// document without erasing anything a trigger has since added to it.
	batch.set(db.collection(Collections.statements).doc(statementId), statement, { merge: true });
	batch.update(sessionRef(sessionId), gamePatch(next));
	await batch.commit();

	return { phase: next.phase, turnIndex: next.turnIndex };
}

async function openVote(sessionId: string, session: AgoraSession): Promise<Result> {
	const game = requireGame(session);
	requirePhase(game, ChallengePhase.floor);

	if (!game.challengerStatementId) {
		throw new HttpsError('failed-precondition', 'There is nothing on the board to vote on yet');
	}

	const next: VotingGameState = {
		...game,
		phase: ChallengePhase.vote,
		updatedAt: Date.now(),
	};
	await sessionRef(sessionId).update(gamePatch(next));

	return { phase: next.phase, turnIndex: next.turnIndex };
}

/**
 * Counts the room, seats or discards the challenger, and pays for a seat won.
 *
 * Three steps rather than one transaction, because a transaction cannot run a
 * query and the tally IS a query. Reading the votes before closing the window
 * would leave a gap in which a vote lands, is not read, and is never counted —
 * so the phase is closed FIRST. After that every late vote is either already
 * counted or arrives at a ballot the voter has been told is shut.
 */
async function resolveTurn(sessionId: string, session: AgoraSession): Promise<Result> {
	const ref = sessionRef(sessionId);

	// 1. Close the window. Also the idempotency guard: a second tap lands here
	//    and finds a phase that is no longer `vote`.
	const closing = await db.runTransaction(async (transaction) => {
		const fresh = (await transaction.get(ref)).data() as AgoraSession | undefined;
		const game = fresh?.votingGame;
		if (!game || game.phase !== ChallengePhase.vote) {
			throw new HttpsError('failed-precondition', 'The vote on this challenge is not open');
		}
		const next: VotingGameState = {
			...game,
			phase: ChallengePhase.resolving,
			updatedAt: Date.now(),
		};
		transaction.update(ref, gamePatch(next));

		return next;
	});

	const challengerId = closing.challengerStatementId;
	if (!challengerId) {
		throw new HttpsError('failed-precondition', 'There is no challenger to judge');
	}

	// 2. Count. The votes collection is the source of truth, not the cached
	//    `selections` tallies — a vote that landed a moment ago may not have
	//    reached them yet, and dropping it is the one thing a vote may not do.
	const votesSnap = await db
		.collection(Collections.votes)
		.where('parentId', '==', session.challengeQuestionId)
		.get();
	const votes = votesSnap.docs.map((doc) => doc.data() as Vote);

	const boardCandidates: VotingCandidate[] = session.voting?.candidates ?? [];
	const boardIds = boardCandidates.map((candidate) => candidate.statementId);
	const consensusById: Record<string, number> = {};
	for (const candidate of boardCandidates) {
		consensusById[candidate.statementId] = candidate.consensus;
	}

	const counts = tallyVotes(votes, [...boardIds, challengerId]);
	const verdict = resolveChallenge(counts, boardIds, challengerId, consensusById);

	const evicted = verdict.evictedStatementId
		? boardCandidates.find((candidate) => candidate.statementId === verdict.evictedStatementId)
		: undefined;

	// 3. Apply. Re-asserts the phase it set itself, so two overlapping resolves
	//    cannot both pay.
	const outcome = await db.runTransaction(async (transaction) => {
		const fresh = (await transaction.get(ref)).data() as AgoraSession | undefined;
		const game = fresh?.votingGame;
		if (!game || game.phase !== ChallengePhase.resolving) {
			throw new HttpsError('failed-precondition', 'This challenge was already resolved');
		}

		const speakerUserId = game.speakerUserId ?? '';
		let pointsAwarded = 0;

		if (verdict.survived && speakerUserId) {
			const participantRef = db
				.collection(Collections.agoraParticipants)
				.doc(createAgoraParticipantId(sessionId, speakerUserId));
			const participantSnap = await transaction.get(participantRef);
			const participant = participantSnap.data() as AgoraParticipant | undefined;
			if (participant) {
				const points = { ...participant.points };
				points.proposals += AGORA_POINTS.CHALLENGE_SURVIVED;
				points.total += AGORA_POINTS.CHALLENGE_SURVIVED;
				transaction.update(participantRef, { points, lastActive: Date.now() });
				pointsAwarded = AGORA_POINTS.CHALLENGE_SURVIVED;
			}
		}

		const resolved: ChallengeOutcome = {
			speakerUserId,
			speakerAnonName: game.speakerAnonName ?? '',
			challengerStatementId: challengerId,
			challengerStatement: game.challengerStatement ?? '',
			survived: verdict.survived,
			by: ChallengeResolvedBy.vote,
			challengerVotes: verdict.challengerVotes,
			counts,
			...(evicted
				? { evictedStatementId: evicted.statementId, evictedStatement: evicted.statement }
				: {}),
			pointsAwarded,
			resolvedAt: Date.now(),
		};

		const next: VotingGameState = {
			...game,
			phase: ChallengePhase.resolved,
			lastOutcome: resolved,
			updatedAt: Date.now(),
		};

		const patch: Record<string, unknown> = gamePatch(next);

		if (verdict.survived) {
			// The ballot the class now votes on. The challenger is written as a
			// full candidate, text included: the voting stage holds no statements
			// listener, so this object is the only place a reloaded phone — and
			// the results screen — can read its words.
			const survivors = boardCandidates.filter(
				(candidate) => candidate.statementId !== verdict.evictedStatementId,
			);
			patch.voting = {
				candidateIds: verdict.boardIds,
				candidates: [
					...survivors,
					{ statementId: challengerId, statement: game.challengerStatement ?? '', consensus: 0 },
				],
				computedAt: Date.now(),
			};
		}

		transaction.update(ref, patch);

		return resolved;
	});

	await settleVotesAfterResolve(verdict.survived, challengerId, verdict.evictedStatementId, votesSnap);

	return { phase: ChallengePhase.resolved, turnIndex: closing.turnIndex, outcome };
}

/**
 * Tidies up after a verdict: a rejected challenger is deleted, and the votes
 * left stranded on an evicted option are released.
 *
 * Released, never deleted — the counting trigger reads the document that
 * replaced the old one, and a deleted document has nothing to read, so the
 * tally would keep counting a vote for an option that is gone. Writing the
 * withdrawal sentinel is what lets it decrement.
 */
async function settleVotesAfterResolve(
	survived: boolean,
	challengerId: string,
	evictedStatementId: string | undefined,
	votesSnap: FirebaseFirestore.QuerySnapshot,
): Promise<void> {
	const batch = db.batch();
	let writes = 0;

	if (!survived) {
		batch.delete(db.collection(Collections.statements).doc(challengerId));
		writes += 1;
	}

	if (evictedStatementId) {
		for (const doc of votesSnap.docs) {
			const vote = doc.data() as Vote;
			// Already withdrawn: rewriting it would be a no-op the trigger
			// rejects, and it would log an error for every one of them.
			if (vote.statementId !== evictedStatementId) continue;
			batch.update(doc.ref, { statementId: NO_VOTE, lastUpdate: Date.now() });
			writes += 1;
		}
	}

	if (writes > 0) await batch.commit();
}

/** A pass or a skip. Neither is a defeat, and neither costs the student anything. */
async function endTurnWithout(
	sessionId: string,
	session: AgoraSession,
	by: ChallengeResolvedBy,
): Promise<Result> {
	const game = requireGame(session);
	requirePhase(game, ChallengePhase.idle, ChallengePhase.floor);

	const speakerUserId = game.speakerUserId ?? '';
	await discardChallenger(game);

	const outcome: ChallengeOutcome = {
		speakerUserId,
		speakerAnonName: game.speakerAnonName ?? '',
		survived: false,
		by,
		challengerVotes: 0,
		counts: {},
		pointsAwarded: 0,
		resolvedAt: Date.now(),
	};

	const passed = new Set(game.passedUserIds);
	const skipped = new Set(game.skippedUserIds);
	if (speakerUserId) {
		if (by === ChallengeResolvedBy.pass) passed.add(speakerUserId);
		else skipped.add(speakerUserId);
	}

	const next: VotingGameState = {
		...clearedChallenger(game),
		phase: ChallengePhase.resolved,
		passedUserIds: [...passed],
		skippedUserIds: [...skipped],
		lastOutcome: outcome,
		updatedAt: Date.now(),
	};
	await sessionRef(sessionId).update(gamePatch(next));

	return { phase: next.phase, turnIndex: next.turnIndex, outcome };
}

async function nextSpeaker(sessionId: string, session: AgoraSession): Promise<Result> {
	const game = requireGame(session);
	requirePhase(game, ChallengePhase.resolved, ChallengePhase.idle);

	const turnIndex = game.turnIndex + 1;
	const exhausted = turnIndex >= game.order.length || turnIndex >= game.maxTurns;

	const next: VotingGameState = exhausted
		? { ...clearedChallenger(game), phase: ChallengePhase.ended, updatedAt: Date.now() }
		: {
				...clearedChallenger(game),
				turnIndex,
				phase: ChallengePhase.idle,
				speakerUserId: game.order[turnIndex],
				speakerAnonName: game.orderNames[turnIndex] ?? '',
				updatedAt: Date.now(),
			};

	await sessionRef(sessionId).update(gamePatch(next));

	return { phase: next.phase, turnIndex: next.turnIndex };
}

async function endRound(sessionId: string, session: AgoraSession): Promise<Result> {
	const game = requireGame(session);
	if (game.phase === ChallengePhase.ended) {
		return { phase: game.phase, turnIndex: game.turnIndex };
	}

	await discardChallenger(game);

	const next: VotingGameState = {
		...clearedChallenger(game),
		phase: ChallengePhase.ended,
		updatedAt: Date.now(),
	};
	await sessionRef(sessionId).update(gamePatch(next));

	return { phase: next.phase, turnIndex: next.turnIndex };
}
