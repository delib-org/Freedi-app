import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraMessageKind,
	AgoraParticipant,
	AgoraSuggestionStatus,
	AGORA_ANTI_GAMING,
	AGORA_POINTS,
	NotificationTriggerType,
	SourceApp,
	StatementType,
	createAgoraParticipantId,
	functionConfig,
	getRandomUID,
	isAgoraHidden,
	ModeratedDoc,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { awardCredit } from '../engagement/credits/creditEngine';
import { CreditAction } from '@freedi/shared-types';

interface Request {
	sessionId: string;
	suggestionId: string;
	resolution: AgoraSuggestionStatus;
}

interface Result {
	ok: boolean;
}

interface WeaveLedger {
	/** Pay the helper for this weave, or only celebrate it (collusion cap) */
	awardHelper: boolean;
}

/**
 * How often this helper has already been woven into this proposal — the
 * collusion cap on the HELPER's side. Read BEFORE the status update so the
 * suggestion being resolved is not counted as its own precedent.
 *
 * Queried by parentId alone (a single-field index every project has) and
 * filtered in memory: suggestions per proposal are bounded by the open-idea
 * cap times the class size, so this stays a handful of docs.
 */
async function readWeaveLedger(proposalId: string, suggesterId: string): Promise<WeaveLedger> {
	const siblings = await db
		.collection(Collections.statements)
		.where('parentId', '==', proposalId)
		.get();

	let wovenByThisHelper = 0;
	siblings.forEach((docSnap) => {
		const data = docSnap.data() as { suggestionStatus?: string; creatorId?: string };
		if (data.suggestionStatus !== AgoraSuggestionStatus.implemented || !data.creatorId) return;
		if (data.creatorId === suggesterId) wovenByThisHelper++;
	});

	return {
		awardHelper: wovenByThisHelper < AGORA_ANTI_GAMING.MAX_WOVEN_AWARDS_PER_HELPER_PER_PROPOSAL,
	};
}

/**
 * The AUTHOR's integration credit for weaving this helper in, paid through the
 * one ledger the game keeps for it: `score.weaveCreditedHelpers` — the same
 * array the thank-then-revise path (`creditWeaves` in fn_onAgoraProposal)
 * checks and records. The two paths used to keep separate books (this one
 * counted implemented siblings), so the same helper could be paid for twice,
 * once by each. Check-and-record in one transaction: whichever path gets there
 * first records the helper, and the other finds them already in the ledger.
 *
 * `set` with merge, not `update`: on a proposal nobody has rated or edited yet
 * there is no score doc, and the ledger entry must still be written or the
 * later `creditWeaves` pass would pay the same helper a second time.
 */
async function creditAuthorWeave(
	sessionId: string,
	proposalId: string,
	authorId: string,
	helperUid: string,
): Promise<void> {
	const scoreRef = db.collection(Collections.agoraScores).doc(proposalId);
	const authorRef = db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(sessionId, authorId));

	await db.runTransaction(async (transaction) => {
		const [scoreSnap, authorSnap] = await Promise.all([
			transaction.get(scoreRef),
			transaction.get(authorRef),
		]);
		if (!authorSnap.exists) return;
		const credited = (scoreSnap.data()?.weaveCreditedHelpers as string[] | undefined) ?? [];
		if (credited.includes(helperUid)) return;
		if (credited.length >= AGORA_POINTS.MAX_WEAVE_CREDITS_PER_PROPOSAL) return;

		transaction.set(
			scoreRef,
			{ weaveCreditedHelpers: [...credited, helperUid], lastUpdate: Date.now() },
			{ merge: true },
		);

		const participant = authorSnap.data() as AgoraParticipant;
		const points = { ...participant.points };
		points.proposals += AGORA_POINTS.WEAVE_CREDIT_PER_HELPER;
		points.total += AGORA_POINTS.WEAVE_CREDIT_PER_HELPER;
		transaction.update(authorRef, { points, lastActive: Date.now() });
	});
}

/**
 * Say the reward inside the conversation that earned it. The celebration
 * pops once and is gone; a student who was on another screen used to have
 * no way of learning what a thank-you was worth. This line stays in the
 * thread, next to the idea it paid for.
 */
async function announceAward(
	sessionId: string,
	suggestion: { parentId?: string; creatorId?: string; agoraThreadUserId?: string },
	points: number,
	/** The author who resolved — the line is THEIR doing, so the helper reads it as incoming */
	resolvedBy: string,
): Promise<void> {
	const messageId = getRandomUID();
	await db
		.collection(Collections.statements)
		.doc(messageId)
		.set({
			statementId: messageId,
			statement: '',
			agoraPointsAwarded: points,
			statementType: StatementType.suggestion,
			agoraMessageKind: AgoraMessageKind.award,
			// The helper's thread — the conversation whose work was paid
			agoraThreadUserId: suggestion.agoraThreadUserId ?? suggestion.creatorId ?? '',
			parentId: suggestion.parentId ?? '',
			creatorId: resolvedBy,
			agoraSessionId: sessionId,
			consensus: 0,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
		});
}

/**
 * The proposal author accepts or thanks an improvement suggestion.
 * Server-side so the suggester's helping points can't be spoofed:
 * validates the caller authored the parent proposal, stamps the status,
 * awards points, and drops an in-app notification for the suggester.
 */
export const agoraResolveSuggestion = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { sessionId, suggestionId, resolution } = request.data ?? {};
		if (!sessionId || !suggestionId) {
			throw new HttpsError('invalid-argument', 'sessionId and suggestionId required');
		}
		if (
			resolution !== AgoraSuggestionStatus.accepted &&
			resolution !== AgoraSuggestionStatus.thanked &&
			resolution !== AgoraSuggestionStatus.declined &&
			resolution !== AgoraSuggestionStatus.implemented
		) {
			throw new HttpsError(
				'invalid-argument',
				'resolution must be accepted, thanked, declined or implemented',
			);
		}

		try {
			const suggestionRef = db.collection(Collections.statements).doc(suggestionId);
			const suggestionSnap = await suggestionRef.get();
			if (!suggestionSnap.exists) {
				throw new HttpsError('not-found', 'Suggestion not found');
			}
			const suggestion = suggestionSnap.data() as {
				parentId?: string;
				creatorId?: string;
				agoraSessionId?: string;
				suggestionStatus?: string;
				agoraMessageKind?: string;
				agoraThreadUserId?: string;
			};
			// A suggestion the teacher took down cannot be thanked or woven in
			if (isAgoraHidden(suggestionSnap.data() as ModeratedDoc)) {
				throw new HttpsError('failed-precondition', 'hidden');
			}
			if (suggestion.agoraSessionId !== sessionId) {
				throw new HttpsError('failed-precondition', 'Suggestion is not part of this session');
			}
			// Plain chat has no lifecycle: only suggestion-kind messages (or
			// legacy docs, which predate the discriminator) can be resolved
			if (suggestion.agoraMessageKind === AgoraMessageKind.chat) {
				throw new HttpsError('failed-precondition', 'Chat messages have no status to resolve');
			}
			if (resolution === AgoraSuggestionStatus.implemented) {
				// The second mark of the lifecycle: only an ACCEPTED suggestion
				// can be marked as woven into the text
				if (suggestion.suggestionStatus === AgoraSuggestionStatus.implemented) {
					return { ok: true }; // idempotent
				}
				if (suggestion.suggestionStatus !== AgoraSuggestionStatus.accepted) {
					throw new HttpsError(
						'failed-precondition',
						'Only accepted suggestions can be marked implemented',
					);
				}
			} else if (
				suggestion.suggestionStatus &&
				suggestion.suggestionStatus !== AgoraSuggestionStatus.open
			) {
				return { ok: true }; // already resolved — idempotent
			}

			const proposalSnap = await db
				.collection(Collections.statements)
				.doc(suggestion.parentId ?? '')
				.get();
			if (!proposalSnap.exists || proposalSnap.data()?.creatorId !== uid) {
				throw new HttpsError(
					'permission-denied',
					'Only the proposal author can resolve suggestions',
				);
			}

			const suggesterId = suggestion.creatorId;
			const proposalId = suggestion.parentId ?? '';
			// Read the helper's cap BEFORE stamping the new status, so this very
			// suggestion cannot count as its own precedent
			const ledger: WeaveLedger =
				resolution === AgoraSuggestionStatus.implemented && suggesterId && suggesterId !== uid
					? await readWeaveLedger(proposalId, suggesterId)
					: { awardHelper: true };

			// The improvement cycle's ladder (docs: apps/agora/docs/feedback-cycle.md):
			// accept = the promise (+1), woven-in = the promise kept (+2), decline
			// is free. Past the collusion cap the weave still CELEBRATES but pays
			// nothing — recognition is decoupled from currency on purpose.
			const pointsAwarded: number =
				resolution === AgoraSuggestionStatus.accepted
					? AGORA_POINTS.SUGGESTION_ACCEPTED
					: resolution === AgoraSuggestionStatus.implemented
						? ledger.awardHelper
							? AGORA_POINTS.SUGGESTION_IMPLEMENTED
							: 0
						: resolution === AgoraSuggestionStatus.declined
							? AGORA_POINTS.SUGGESTION_DECLINED
							: AGORA_POINTS.SUGGESTION_THANKED;

			// The status stamp is the gate for everything that follows (points,
			// award line, notification). Check-then-act must be transactional:
			// two racing resolves (double-tap, retried callable) both pass the
			// stale pre-read above, and without this gate both would pay.
			const wonTransition = await db.runTransaction(async (transaction) => {
				const freshSnap = await transaction.get(suggestionRef);
				if (!freshSnap.exists) return false;
				const fresh = freshSnap.data() as { suggestionStatus?: string };
				if (resolution === AgoraSuggestionStatus.implemented) {
					if (fresh.suggestionStatus !== AgoraSuggestionStatus.accepted) return false;
				} else if (
					fresh.suggestionStatus &&
					fresh.suggestionStatus !== AgoraSuggestionStatus.open
				) {
					return false;
				}
				transaction.update(suggestionRef, {
					suggestionStatus: resolution,
					// The precise clock of the transition: lastUpdate can't time it,
					// because this very write bumps it
					statusChangedAt: Date.now(),
					lastUpdate: Date.now(),
				});

				return true;
			});
			if (!wonTransition) {
				return { ok: true }; // lost the race — the winner did the side effects
			}

			// A thank is feedback: it arms the author's revision credit and the
			// thank-then-revise weave (see fn_onAgoraProposal). Stamped on the
			// score doc because that's the doc the proposal-write trigger reads.
			if (resolution === AgoraSuggestionStatus.thanked) {
				await db
					.collection(Collections.agoraScores)
					.doc(proposalId)
					.set({ lastThankAt: Date.now(), lastUpdate: Date.now() }, { merge: true });
			}

			// The author's side of the economy: weaving a classmate's idea into
			// your text is real editorial work. Credited once per DISTINCT
			// helper — through the shared `weaveCreditedHelpers` ledger, so the
			// thank-then-revise path can never pay for the same helper again.
			if (resolution === AgoraSuggestionStatus.implemented && suggesterId && suggesterId !== uid) {
				await creditAuthorWeave(sessionId, proposalId, uid, suggesterId);
			}

			if (suggesterId && suggesterId !== uid) {
				// Cross-app engagement credits — non-blocking by design.
				// BOTH rungs count: the promise (accepted) and the promise kept
				// (implemented). Crediting only the former made the cross-app
				// engagement system blind to the cycle's biggest moment.
				if (
					resolution === AgoraSuggestionStatus.accepted ||
					resolution === AgoraSuggestionStatus.implemented
				) {
					awardCredit({
						userId: suggesterId,
						action: CreditAction.SUGGESTION_ACCEPTED,
						sourceApp: SourceApp.AGORA,
						statementId: suggestionId,
					}).catch((error: unknown) => {
						logError(error, {
							operation: 'agora.resolveSuggestion.awardCredit',
							userId: suggesterId,
						});
					});
				}
				if (pointsAwarded !== 0) {
					const suggesterRef = db
						.collection(Collections.agoraParticipants)
						.doc(createAgoraParticipantId(sessionId, suggesterId));
					await db.runTransaction(async (transaction) => {
						const snap = await transaction.get(suggesterRef);
						if (!snap.exists) return;
						const participant = snap.data() as AgoraParticipant;
						const points = { ...participant.points };
						// Floor at 0: a student's first rejected idea must not
						// open the game with a minus sign
						points.helping = Math.max(0, points.helping + pointsAwarded);
						points.total = Math.max(0, points.total + pointsAwarded);
						transaction.update(suggesterRef, { points, lastActive: Date.now() });
					});
				}

				if (pointsAwarded > 0) {
					await announceAward(sessionId, suggestion, pointsAwarded, uid);
				}

				const notificationId = getRandomUID();
				await db
					.collection(Collections.inAppNotifications)
					.doc(notificationId)
					.set({
						notificationId,
						userId: suggesterId,
						parentId: suggestion.parentId ?? '',
						statementId: suggestionId,
						statementType: StatementType.statement,
						text:
							resolution === AgoraSuggestionStatus.accepted
								? 'Your improvement suggestion was accepted!'
								: resolution === AgoraSuggestionStatus.implemented
									? 'Your idea was woven into the proposal!'
									: resolution === AgoraSuggestionStatus.declined
										? 'Your suggestion was not adopted this time.'
										: 'You received a thank-you for your suggestion!',
						creatorId: uid,
						creatorName: 'Anonymous traveler',
						sourceApp: SourceApp.AGORA,
						// The client renders the number from HERE rather than from a
						// hardcoded string, so a retune of AGORA_POINTS can never make
						// the celebration lie — and a weave past the collusion cap
						// honestly celebrates with no points attached.
						pointsAwarded,
						triggerType:
							resolution === AgoraSuggestionStatus.accepted
								? NotificationTriggerType.AGORA_SUGGESTION_ACCEPTED
								: resolution === AgoraSuggestionStatus.implemented
									? NotificationTriggerType.AGORA_SUGGESTION_IMPLEMENTED
									: resolution === AgoraSuggestionStatus.declined
										? NotificationTriggerType.AGORA_SUGGESTION_DECLINED
										: NotificationTriggerType.AGORA_SUGGESTION_THANKED,
						targetPath: `/play/${sessionId}`,
						read: false,
						createdAt: Date.now(),
					});
			}

			return { ok: true };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.resolveSuggestion',
				userId: uid,
				metadata: { sessionId, suggestionId, resolution },
			});
			throw new HttpsError('internal', 'Failed to resolve suggestion');
		}
	},
);
