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
	AGORA_POINTS,
	NotificationTriggerType,
	SourceApp,
	StatementType,
	createAgoraParticipantId,
	functionConfig,
	getRandomUID,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

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
 */
async function announceEdit(
	sessionId: string,
	proposalId: string,
	proposal: ProposalDoc,
	previousText: string,
): Promise<void> {
	const messageId = getRandomUID();
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
 * Stamp the moment the author last rewrote their text, plus the bridging
 * score as it stood right then.
 *
 * `lastEditAt` is the ONLY trustworthy edit clock in the game: the statement's
 * own lastUpdate is bumped by the evaluation pipeline, so the square orders
 * itself and lights its EDITED chips off this field. It is therefore stamped
 * on every real text change — including the first one, before anybody has
 * rated. That case used to return early (no score doc, so nothing to write),
 * which left an early edit invisible: the proposal sat wherever its creation
 * time put it and wore no chip.
 *
 * The baseline is what the owner's "N ratings moved · bridge power rose" chip
 * is measured against. It used to live in sessionStorage, so one refresh — or
 * picking the phone back up — silently erased the direction the whole
 * improvement loop is supposed to report.
 */
async function stampEditBaseline(
	sessionId: string,
	statementId: string,
	creatorId: string,
): Promise<void> {
	const scoreRef = db.collection(Collections.agoraScores).doc(statementId);
	await db.runTransaction(async (transaction) => {
		const snap = await transaction.get(scoreRef);
		if (snap.exists) {
			transaction.update(scoreRef, {
				bridgingAtLastEdit: (snap.data()?.bridgingScore as number | undefined) ?? 0,
				lastEditAt: Date.now(),
				lastUpdate: Date.now(),
			});

			return;
		}

		// Nobody has rated yet, so there is no score doc and no baseline worth
		// reporting — but the edit clock still has to exist. Seed a whole,
		// schema-valid doc (the client parses these strictly and drops partials)
		// with zeroed aggregates; the evaluation trigger fills them in later.
		const authorSnap = await transaction.get(
			db
				.collection(Collections.agoraParticipants)
				.doc(createAgoraParticipantId(sessionId, creatorId)),
		);
		const author = authorSnap.data() as AgoraParticipant | undefined;
		const authorCamp = author?.camp ?? AgoraCamp.center;
		const emptyAggregate = (): AgoraCampAggregate => ({
			sum: 0,
			n: 0,
			positiveN: 0,
			studentDist: emptyDist(),
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
			lastEditAt: Date.now(),
			lastUpdate: Date.now(),
		};
		transaction.set(scoreRef, score);
	});
}

/**
 * Agora proposal lifecycle. Guard first: this sits on the app-wide
 * statements collection, so anything without an agoraSessionId returns
 * before touching the database.
 */
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

				return;
			}

			// A real text change — not a status bump or an evaluation rollup
			if (before && after && before.statement !== after.statement) {
				await stampEditBaseline(sessionId, statementId, after.creatorId ?? '');
				await announceEdit(sessionId, statementId, after, before.statement ?? '');
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
