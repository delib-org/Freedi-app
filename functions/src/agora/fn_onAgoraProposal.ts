import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraCamp,
	AgoraCampAggregate,
	emptyDist,
	AgoraMessageKind,
	AgoraParticipant,
	AgoraProposalScore,
	AgoraSession,
	AgoraSuggestionStatus,
	agoraClassSupport,
	assessRevision,
	AGORA_ANTI_GAMING,
	AGORA_POINTS,
	NotificationTriggerType,
	SourceApp,
	StatementType,
	createAgoraParticipantId,
	functionConfig,
	getRandomUID,
	isAgoraAiUid,
	resolveSessionFlow,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { autoElderReviews } from './fn_agoraCharacterReview';

interface ProposalDoc {
	statementId?: string;
	statement?: string;
	statementType?: string;
	creatorId?: string;
	agoraSessionId?: string;
	anonName?: string;
	parentId?: string;
	topParentId?: string;
	parents?: string[];
	creator?: unknown;
}

/**
 * Announce a real text change inside every conversation about the proposal.
 * Wikipedia's habit: a page that changed says what changed, in place, so a
 * helper never has to remember the old wording to see whether their idea
 * landed. The previous text rides along and the client renders the diff.
 *
 * Server-side because only the trigger holds both versions — and because a
 * client-written record of "what the text used to say" would be a record
 * anyone could write.
 *
 * The doc id is DERIVED from the proposal and the write that changed it
 * (`editStamp` = the after-snapshot's updateTime), not minted fresh: a
 * redelivered trigger then `set`s the same doc again instead of announcing
 * the same edit twice in every thread.
 */
async function announceEdit(
	sessionId: string,
	proposalId: string,
	proposal: ProposalDoc,
	previousText: string,
	editStamp: number,
): Promise<void> {
	const messageId = `${proposalId}--edit--${editStamp}`;
	await db
		.collection(Collections.statements)
		.doc(messageId)
		.set({
			statementId: messageId,
			statement: proposal.statement ?? '',
			agoraPreviousText: previousText,
			statementType: StatementType.suggestion,
			agoraMessageKind: AgoraMessageKind.edit,
			// Deliberately NO agoraThreadUserId: an edit belongs to every
			// conversation on this proposal, not to one helper's thread
			parentId: proposalId,
			topParentId: proposal.topParentId ?? '',
			parents: proposal.parents ?? [],
			creatorId: proposal.creatorId ?? '',
			creator: proposal.creator ?? null,
			anonName: proposal.anonName ?? '',
			agoraSessionId: sessionId,
			consensus: 0,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
		});
}

/**
 * Award the one-time first-proposal credit. Writing the opening draft is
 * the steepest step of the funnel and used to earn exactly nothing — the
 * constant existed but nothing ever paid it out, so a student's first real
 * effort was met with silence until a classmate happened to act.
 *
 * Idempotent via a stamp on the participant doc, because the trigger fires
 * on every write to the statement and a student may submit more than one
 * proposal across a long session.
 */
async function creditFirstProposal(
	sessionId: string,
	creatorId: string,
	statementId: string,
): Promise<void> {
	const participantRef = db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(sessionId, creatorId));

	const awarded = await db.runTransaction(async (transaction) => {
		const snap = await transaction.get(participantRef);
		if (!snap.exists) return false;
		const participant = snap.data() as AgoraParticipant;
		if (participant.firstProposalAwardedAt) return false;
		const points = { ...participant.points };
		points.proposals += AGORA_POINTS.PROPOSAL_SUBMITTED;
		points.total += AGORA_POINTS.PROPOSAL_SUBMITTED;
		transaction.update(participantRef, {
			points,
			firstProposalAwardedAt: Date.now(),
			lastActive: Date.now(),
		});

		return true;
	});
	if (!awarded) return;

	const notificationId = getRandomUID();
	await db
		.collection(Collections.inAppNotifications)
		.doc(notificationId)
		.set({
			notificationId,
			userId: creatorId,
			parentId: statementId,
			statementId,
			statementType: StatementType.option,
			text: 'Your proposal is on the square!',
			creatorId,
			creatorName: 'The square',
			sourceApp: SourceApp.AGORA,
			triggerType: NotificationTriggerType.AGORA_PROPOSAL_CREDITED,
			targetPath: `/play/${sessionId}`,
			pointsAwarded: AGORA_POINTS.PROPOSAL_SUBMITTED,
			read: false,
			createdAt: Date.now(),
		});
}

/**
 * Stamp the moment the author last rewrote their text, plus the two readings
 * of the class as they stood right then.
 *
 * `lastEditAt` is the ONLY trustworthy edit clock in the game: the statement's
 * own lastUpdate is bumped by the evaluation pipeline, so the square orders
 * itself and lights its EDITED chips off this field. It is therefore stamped
 * on every real text change — including the first one, before anybody has
 * rated. That case used to return early (no score doc, so nothing to write),
 * which left an early edit invisible: the proposal sat wherever its creation
 * time put it and wore no chip.
 *
 * The baselines are what the owner's "N ratings moved · support rose" chip is
 * measured against. They used to live in sessionStorage, so one refresh — or
 * picking the phone back up — silently erased the direction the whole
 * improvement loop is supposed to report.
 *
 * TWO baselines, because the chip reports the class average and the score line
 * reports the bridging score, and they move at different speeds (see
 * `agoraClassSupport`). The average is only stamped when somebody has actually
 * rated: absent means "no baseline", which the screens render as "here is where
 * the class stands" rather than as a move of zero.
 */
interface RevisionOutcome {
	/** The text really changed (word-delta gate) — merged or not */
	realChange: boolean;
	/** A real change outside the debounce window — the save was a revision EVENT */
	isNewEvent: boolean;
	/** Revision credit paid to the author on this save (0 when gated) */
	credit: number;
	/** The author's first credited revision — the client celebrates this one in full */
	isFirstCredit: boolean;
}

const NO_REVISION: RevisionOutcome = {
	realChange: false,
	isNewEvent: false,
	credit: 0,
	isFirstCredit: false,
};

/** Student raters on a proposal — the histograms count students only, by construction */
function studentRaterCount(perCamp: AgoraProposalScore['perCamp']): number {
	const sumDist = (dist?: readonly number[]): number =>
		dist ? dist.reduce((a, b) => a + b, 0) : 0;

	return (
		sumDist(perCamp.left.studentDist) +
		sumDist(perCamp.right.studentDist) +
		sumDist(perCamp.center.studentDist)
	);
}

/**
 * Cap the journey at EDIT_HISTORY_MAX keeping the FIRST entry (where the
 * journey began) and the newest tail — the start and the recent road matter,
 * the middle doesn't.
 */
function capHistory(
	history: { editedAt: number; bridgingAtEdit: number }[],
): { editedAt: number; bridgingAtEdit: number }[] {
	const max = AGORA_ANTI_GAMING.EDIT_HISTORY_MAX;
	if (history.length <= max) return history;

	return [history[0], ...history.slice(history.length - (max - 1))];
}

async function stampEditBaseline(
	sessionId: string,
	statementId: string,
	creatorId: string,
	previousText: string,
	newText: string,
): Promise<RevisionOutcome> {
	const scoreRef = db.collection(Collections.agoraScores).doc(statementId);
	const participantRef = db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(sessionId, creatorId));

	return db.runTransaction(async (transaction) => {
		const snap = await transaction.get(scoreRef);
		const participantSnap = await transaction.get(participantRef);
		if (snap.exists) {
			const existing = snap.data() as AgoraProposalScore | undefined;
			const support = existing?.perCamp ? agoraClassSupport(existing.perCamp) : undefined;

			// Classify the save: cosmetic touch-up, polish of the event in
			// flight, or a fresh revision — and what, if anything, it pays.
			const history = [...(existing?.editHistory ?? [])];
			const assessment = assessRevision({
				prevText: previousText,
				newText,
				now: Date.now(),
				lastEventAt: history.length ? history[history.length - 1].editedAt : undefined,
				creditedRevisions: existing?.revisionCredit?.credited ?? 0,
				studentRatingsNow: existing?.perCamp ? studentRaterCount(existing.perCamp) : 0,
				studentRatingsAtCredit: existing?.revisionCredit?.studentRatingsAtCredit,
				lastThankAt: existing?.lastThankAt,
				lastCreditAt: existing?.revisionCredit?.lastCreditAt,
			});
			if (assessment.isNewEvent) {
				history.push({
					editedAt: Date.now(),
					bridgingAtEdit: existing?.bridgingScore ?? 0,
				});
			} else if (assessment.mergeIntoLastEvent && history.length) {
				history[history.length - 1] = {
					...history[history.length - 1],
					editedAt: Date.now(),
				};
			}

			transaction.update(scoreRef, {
				bridgingAtLastEdit: existing?.bridgingScore ?? 0,
				// Left untouched when nobody has rated yet, so an earlier baseline
				// is never replaced by a fabricated one
				...(support ? { supportAtLastEdit: support.percent } : {}),
				...(assessment.isNewEvent || assessment.mergeIntoLastEvent
					? { editHistory: capHistory(history) }
					: {}),
				...(assessment.credit > 0
					? {
							revisionCredit: {
								lastCreditAt: Date.now(),
								studentRatingsAtCredit: existing?.perCamp ? studentRaterCount(existing.perCamp) : 0,
								credited: (existing?.revisionCredit?.credited ?? 0) + 1,
							},
						}
					: {}),
				lastEditAt: Date.now(),
				lastUpdate: Date.now(),
			});

			if (assessment.credit > 0 && participantSnap.exists) {
				const participant = participantSnap.data() as AgoraParticipant;
				const points = { ...participant.points };
				points.revising = (points.revising ?? 0) + assessment.credit;
				points.total += assessment.credit;
				transaction.update(participantRef, { points, lastActive: Date.now() });
			}

			return {
				realChange: assessment.realChange,
				isNewEvent: assessment.isNewEvent,
				credit: participantSnap.exists ? assessment.credit : 0,
				isFirstCredit: participantSnap.exists && assessment.isFirstCredit,
			};
		}

		// Nobody has rated yet, so there is no score doc and no baseline worth
		// reporting — but the edit clock still has to exist. Seed a whole,
		// schema-valid doc (the client parses these strictly and drops partials)
		// with zeroed aggregates; the evaluation trigger fills them in later.
		const author = participantSnap.data() as AgoraParticipant | undefined;
		const authorCamp = author?.camp ?? AgoraCamp.center;
		const emptyAggregate = (): AgoraCampAggregate => ({
			sum: 0,
			n: 0,
			positiveN: 0,
			studentDist: emptyDist(),
		});
		// Pre-rating edits still make the journey: they are events (the delta
		// gate applies) that can never pay (no feedback exists yet).
		const seedAssessment = assessRevision({
			prevText: previousText,
			newText,
			now: Date.now(),
			creditedRevisions: 0,
			studentRatingsNow: 0,
		});
		const score: AgoraProposalScore = {
			statementId,
			sessionId,
			authorCamp,
			// The author holds a seat in the camp census that must not count
			// toward their own proposal's eligible rater pool — the square never
			// serves anyone their own text.
			authorPositioned: Boolean(author?.camp && !author.isAI),
			perCamp: {
				left: emptyAggregate(),
				right: emptyAggregate(),
				center: emptyAggregate(),
			},
			bridgingScore: 0,
			bridgingAtLastEdit: 0,
			...(seedAssessment.isNewEvent
				? { editHistory: [{ editedAt: Date.now(), bridgingAtEdit: 0 }] }
				: {}),
			lastEditAt: Date.now(),
			lastUpdate: Date.now(),
		};
		transaction.set(scoreRef, score);

		return NO_REVISION;
	});
}

/** Drop an in-app notification for the proposal's author */
async function notifyOwner(
	sessionId: string,
	statementId: string,
	creatorId: string,
	triggerType: NotificationTriggerType,
	text: string,
	pointsAwarded: number,
	extra: Record<string, unknown> = {},
): Promise<void> {
	const notificationId = getRandomUID();
	await db
		.collection(Collections.inAppNotifications)
		.doc(notificationId)
		.set({
			notificationId,
			userId: creatorId,
			parentId: statementId,
			statementId,
			statementType: StatementType.option,
			text,
			creatorId,
			creatorName: 'The square',
			sourceApp: SourceApp.AGORA,
			triggerType,
			targetPath: `/play/${sessionId}`,
			pointsAwarded,
			read: false,
			createdAt: Date.now(),
			...extra,
		});
}

/**
 * The author's weave credit, re-keyed to the live economy. Since the
 * accept→implemented chain was retired, "the owner wove a helper's idea in"
 * is attested by the PAIR thank-then-revise: the first real revision after a
 * helper's thank pays WEAVE_CREDIT_PER_HELPER, once per distinct helper, up
 * to MAX_WEAVE_CREDITS_PER_PROPOSAL — the same shape the implemented path
 * used, minus the second click nobody could reach.
 *
 * The sibling query happens outside the transaction (queries can't run inside
 * one); the ledger on the score doc is re-read inside it, so a re-delivered
 * trigger can't pay the same helper twice.
 */
async function creditWeaves(
	sessionId: string,
	proposalId: string,
	creatorId: string,
): Promise<number> {
	const siblings = await db
		.collection(Collections.statements)
		.where('parentId', '==', proposalId)
		.get();
	const thankedHelpers = new Set<string>();
	siblings.forEach((docSnap) => {
		const data = docSnap.data() as { suggestionStatus?: string; creatorId?: string };
		const landed =
			data.suggestionStatus === AgoraSuggestionStatus.thanked ||
			data.suggestionStatus === AgoraSuggestionStatus.implemented;
		if (landed && data.creatorId && data.creatorId !== creatorId) {
			thankedHelpers.add(data.creatorId);
		}
	});
	if (thankedHelpers.size === 0) return 0;

	const scoreRef = db.collection(Collections.agoraScores).doc(proposalId);
	const participantRef = db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(sessionId, creatorId));

	return db.runTransaction(async (transaction) => {
		const scoreSnap = await transaction.get(scoreRef);
		const participantSnap = await transaction.get(participantRef);
		if (!scoreSnap.exists || !participantSnap.exists) return 0;

		const score = scoreSnap.data() as AgoraProposalScore;
		const credited = score.weaveCreditedHelpers ?? [];
		const room = AGORA_POINTS.MAX_WEAVE_CREDITS_PER_PROPOSAL - credited.length;
		if (room <= 0) return 0;
		const newHelpers = [...thankedHelpers].filter((h) => !credited.includes(h)).slice(0, room);
		if (newHelpers.length === 0) return 0;

		const paid = newHelpers.length * AGORA_POINTS.WEAVE_CREDIT_PER_HELPER;
		transaction.update(scoreRef, {
			weaveCreditedHelpers: [...credited, ...newHelpers],
			lastUpdate: Date.now(),
		});

		const participant = participantSnap.data() as AgoraParticipant;
		const points = { ...participant.points };
		points.proposals += paid;
		points.total += paid;
		transaction.update(participantRef, { points, lastActive: Date.now() });

		return paid;
	});
}

/**
 * Agora proposal lifecycle. Guard first: this sits on the app-wide
 * statements collection, so anything without an agoraSessionId returns
 * before touching the database.
 */
/**
 * The elders read every fresh proposal and every real revision on their own —
 * presence, not an oracle behind a button. Guarded to TRUE proposals (children
 * of the challenge question — suggestions and thread messages hang off the
 * proposal itself), to human authors, and to sessions whose flow seats a
 * council at all.
 */
async function elderCouncilReads(
	sessionId: string,
	statementId: string,
	proposal: ProposalDoc,
): Promise<void> {
	if (!proposal.creatorId || isAgoraAiUid(proposal.creatorId)) return;
	const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
	if (!sessionSnap.exists) return;
	const session = sessionSnap.data() as AgoraSession;
	if (proposal.parentId !== session.challengeQuestionId) return;
	if (!resolveSessionFlow(session).elders) return;

	await autoElderReviews({
		sessionId,
		session,
		statementId,
		proposalText: proposal.statement ?? '',
	});
}

export const onAgoraProposalWritten = onDocumentWritten(
	{ document: `${Collections.statements}/{statementId}`, ...functionConfig },
	async (event) => {
		const after = event.data?.after.exists ? (event.data.after.data() as ProposalDoc) : null;
		const before = event.data?.before.exists ? (event.data.before.data() as ProposalDoc) : null;
		const proposal = after ?? before;
		if (!proposal?.agoraSessionId) return;
		if (proposal.statementType !== StatementType.option) return;

		const sessionId = proposal.agoraSessionId;
		const statementId = event.params.statementId;

		try {
			if (!before && after?.creatorId) {
				await creditFirstProposal(sessionId, after.creatorId, statementId);
				await elderCouncilReads(sessionId, statementId, after);

				return;
			}

			// A real text change — not a status bump or an evaluation rollup
			if (before && after && before.statement !== after.statement) {
				const creatorId = after.creatorId ?? '';
				const revision = await stampEditBaseline(
					sessionId,
					statementId,
					creatorId,
					before.statement ?? '',
					after.statement ?? '',
				);
				await announceEdit(
					sessionId,
					statementId,
					after,
					before.statement ?? '',
					event.data?.after.updateTime?.toMillis() ?? Date.now(),
				);

				if (revision.credit > 0) {
					await notifyOwner(
						sessionId,
						statementId,
						creatorId,
						NotificationTriggerType.AGORA_REVISION_CREDITED,
						'You revised after listening!',
						revision.credit,
						{ agoraFirstRevision: revision.isFirstCredit },
					);
				}

				// A revision that follows a thank is the weave — pay the author
				// for each distinct helper whose idea landed before this edit.
				// Gated on realChange, NOT on the debounce: a thank arriving
				// mid-polish makes the next save meaningfully new, and the
				// per-helper ledger is the idempotency guard here anyway.
				if (revision.realChange) {
					const wovePoints = await creditWeaves(sessionId, statementId, creatorId);
					if (wovePoints > 0) {
						await notifyOwner(
							sessionId,
							statementId,
							creatorId,
							NotificationTriggerType.AGORA_WEAVE_CREDITED,
							"You wove a classmate's idea into your text!",
							wovePoints,
						);
					}
				}

				// The council answers the revision — each elder against their own
				// previous verdict, so the writer watches persuasion happen.
				await elderCouncilReads(sessionId, statementId, after);
			}
		} catch (error) {
			logError(error, {
				operation: 'agora.onProposalWritten',
				statementId,
				metadata: { sessionId },
			});
		}
	},
);
