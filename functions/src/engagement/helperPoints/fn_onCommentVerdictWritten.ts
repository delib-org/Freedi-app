import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import {
	Collections,
	CreditAction,
	EngagementLevel,
	HELPER_POINTS_TOTAL_SCOPE,
	SourceApp,
	functionConfig,
	getHelperPointsId,
} from '@freedi/shared-types';
import type { CreditTransaction, Statement } from '@freedi/shared-types';
import { getOrCreateUserEngagement } from '../credits/creditEngine';
import { checkAndNotifyLevelUp } from '../credits/levelProgression';

interface CommentVerdictDoc {
	verdictId: string;
	optionId: string;
	commentId: string;
	authorId: string;
	verdict: 'helpful' | 'ignored';
	updatedAt: number;
}

/**
 * Peer-reward pipeline: when a suggestion author marks a comment "helpful",
 * the COMMENTER earns 1 credit; unmarking (delete or flip to "ignored")
 * revokes it.
 *
 * Idempotency: the ledger doc id is deterministic (`helpful_${verdictId}`),
 * so the award transaction no-ops if it already ran and the revoke no-ops if
 * there is nothing to revoke — trigger retries and mark/unmark churn always
 * net out correctly. The stock `awardCredit` engine can't express this
 * (random tx ids, no revoke path), so the ledger + userEngagement writes
 * happen in a local transaction here instead. Alongside the credit, a
 * publicly-readable `helperPoints` tally is kept per question and globally
 * (doc ids `${questionId}--${uid}` / `total--${uid}`) so any app can show a
 * user's helper score next to their name — `userEngagement` is self-read-only.
 */
export const fn_onCommentVerdictWritten = onDocumentWritten(
	{
		document: `${Collections.commentVerdicts}/{verdictId}`,
		region: functionConfig.region,
	},
	async (event) => {
		const before = event.data?.before?.exists
			? (event.data.before.data() as CommentVerdictDoc)
			: null;
		const after = event.data?.after?.exists ? (event.data.after.data() as CommentVerdictDoc) : null;

		const wasHelpful = before?.verdict === 'helpful';
		const isHelpful = after?.verdict === 'helpful';
		if (wasHelpful === isHelpful) return;

		const verdict = after ?? before;
		if (!verdict?.commentId || !verdict?.authorId) {
			logger.warn('[onCommentVerdictWritten] Malformed verdict doc, skipping', {
				verdictId: event.params.verdictId,
			});

			return;
		}

		try {
			if (isHelpful) {
				await awardHelpfulPoint(event.params.verdictId, verdict);
			} else {
				await revokeHelpfulPoint(event.params.verdictId);
			}
		} catch (error) {
			logger.error('[onCommentVerdictWritten] Failed', {
				verdictId: event.params.verdictId,
				isHelpful,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error; // let the trigger retry — both paths are idempotent
		}
	},
);

function calculateLevel(totalCredits: number): EngagementLevel {
	if (totalCredits >= 1500) return EngagementLevel.LEADER;
	if (totalCredits >= 500) return EngagementLevel.ADVOCATE;
	if (totalCredits >= 200) return EngagementLevel.CONTRIBUTOR;
	if (totalCredits >= 50) return EngagementLevel.PARTICIPANT;

	return EngagementLevel.OBSERVER;
}

async function awardHelpfulPoint(verdictId: string, verdict: CommentVerdictDoc): Promise<void> {
	const db = getFirestore();

	const commentSnap = await db.collection(Collections.statements).doc(verdict.commentId).get();
	if (!commentSnap.exists) {
		logger.warn('[onCommentVerdictWritten] Comment not found, skipping award', { verdictId });

		return;
	}
	const comment = commentSnap.data() as Statement;
	const commenterId = comment.creatorId;

	if (!commenterId || commenterId === verdict.authorId) {
		// Authors can't earn points from their own comments (the UI never offers
		// verdict chips on the author's messages, but guard server-side too).
		return;
	}

	// The per-question scope is the option's parent (option → question).
	const optionSnap = await db.collection(Collections.statements).doc(verdict.optionId).get();
	const questionId = optionSnap.exists ? (optionSnap.data() as Statement).parentId : undefined;

	// Ensure the engagement doc exists before the transaction updates it.
	const preEngagement = await getOrCreateUserEngagement(commenterId);
	const oldLevel = preEngagement.level;

	const ledgerRef = db.collection(Collections.creditLedger).doc(`helpful_${verdictId}`);
	const engagementRef = db.collection(Collections.userEngagement).doc(commenterId);
	const totalPointsRef = db
		.collection(Collections.helperPoints)
		.doc(getHelperPointsId(HELPER_POINTS_TOTAL_SCOPE, commenterId));
	const questionPointsRef = questionId
		? db.collection(Collections.helperPoints).doc(getHelperPointsId(questionId, commenterId))
		: null;

	let newLevel: EngagementLevel | null = null;

	await db.runTransaction(async (txn) => {
		const ledgerSnap = await txn.get(ledgerRef);
		if (ledgerSnap.exists) return; // already awarded — idempotent

		const engagementSnap = await txn.get(engagementRef);
		const totalCredits = (engagementSnap.data()?.totalCredits ?? 0) + 1;
		newLevel = calculateLevel(totalCredits);

		const now = Date.now();
		const transaction: CreditTransaction = {
			transactionId: `helpful_${verdictId}`,
			userId: commenterId,
			action: CreditAction.COMMENT_MARKED_HELPFUL,
			amount: 1,
			sourceApp: SourceApp.JOIN,
			statementId: verdict.commentId,
			parentId: verdict.optionId,
			...(questionId ? { topParentId: questionId } : {}),
			createdAt: now,
		};

		txn.set(ledgerRef, transaction);
		txn.update(engagementRef, { totalCredits, level: newLevel, lastUpdate: now });
		bumpHelperPoints(txn, totalPointsRef, HELPER_POINTS_TOTAL_SCOPE, commenterId, now);
		if (questionPointsRef && questionId) {
			bumpHelperPoints(txn, questionPointsRef, questionId, commenterId, now);
		}
	});

	if (newLevel !== null && newLevel > oldLevel) {
		checkAndNotifyLevelUp(commenterId, oldLevel, newLevel, SourceApp.JOIN).catch((err) =>
			logger.error('[onCommentVerdictWritten] Level-up notify failed', { err }),
		);
	}
}

function bumpHelperPoints(
	txn: Transaction,
	ref: DocumentReference,
	scopeId: string,
	userId: string,
	now: number,
): void {
	// set+merge with increment keeps this a blind write — no extra txn reads.
	txn.set(
		ref,
		{
			scopeId,
			userId,
			points: FieldValue.increment(1),
			lastUpdate: now,
		},
		{ merge: true },
	);
}

async function revokeHelpfulPoint(verdictId: string): Promise<void> {
	const db = getFirestore();
	const ledgerRef = db.collection(Collections.creditLedger).doc(`helpful_${verdictId}`);

	await db.runTransaction(async (txn) => {
		const ledgerSnap = await txn.get(ledgerRef);
		if (!ledgerSnap.exists) return; // nothing to revoke — idempotent

		const ledger = ledgerSnap.data() as CreditTransaction;
		const engagementRef = db.collection(Collections.userEngagement).doc(ledger.userId);
		const totalPointsRef = db
			.collection(Collections.helperPoints)
			.doc(getHelperPointsId(HELPER_POINTS_TOTAL_SCOPE, ledger.userId));
		const questionPointsRef = ledger.topParentId
			? db
					.collection(Collections.helperPoints)
					.doc(getHelperPointsId(ledger.topParentId, ledger.userId))
			: null;

		const engagementSnap = await txn.get(engagementRef);
		const totalPointsSnap = await txn.get(totalPointsRef);
		const questionPointsSnap = questionPointsRef ? await txn.get(questionPointsRef) : null;

		const now = Date.now();
		txn.delete(ledgerRef);

		if (engagementSnap.exists) {
			const totalCredits = Math.max(0, (engagementSnap.data()?.totalCredits ?? 0) - 1);
			txn.update(engagementRef, {
				totalCredits,
				level: calculateLevel(totalCredits),
				lastUpdate: now,
			});
		}
		if (totalPointsSnap.exists) {
			txn.update(totalPointsRef, {
				points: Math.max(0, (totalPointsSnap.data()?.points ?? 0) - 1),
				lastUpdate: now,
			});
		}
		if (questionPointsRef && questionPointsSnap?.exists) {
			txn.update(questionPointsRef, {
				points: Math.max(0, (questionPointsSnap.data()?.points ?? 0) - 1),
				lastUpdate: now,
			});
		}
	});
}
