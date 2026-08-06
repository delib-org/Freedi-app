import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraParticipant,
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
 * Stamp the bridging score as it stood the moment the author last edited.
 * The owner's "N ratings moved · bridge power rose" chip is measured against
 * this baseline. It used to live in sessionStorage, so one refresh — or
 * picking the phone back up — silently erased the direction the whole
 * improvement loop is supposed to report.
 */
async function stampEditBaseline(statementId: string): Promise<void> {
	const scoreRef = db.collection(Collections.agoraScores).doc(statementId);
	await db.runTransaction(async (transaction) => {
		const snap = await transaction.get(scoreRef);
		// No score doc yet means nobody has rated this proposal, so the
		// baseline is a plain zero — and the chip has nothing to report anyway
		if (!snap.exists) return;
		transaction.update(scoreRef, {
			bridgingAtLastEdit: (snap.data()?.bridgingScore as number | undefined) ?? 0,
			lastEditAt: Date.now(),
		});
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
				await stampEditBaseline(statementId);
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
