import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { db } from '../../db';
import {
	Collections,
	JoinResolutionUser,
	JOIN_RESOLUTION_USERS_SUBCOLLECTION,
	Role,
	Statement,
	StatementType,
	functionConfig,
} from '@freedi/shared-types';

interface ResolveRequest {
	questionId: string;
}

interface ResolveSummary {
	activatedCount: number;
	failedCount: number;
	confirmedCount: number;
	orphanedCount: number;
	pruningCount: number;
}

/**
 * Admin-only one-time "Resolve intents" step.
 *
 * For each option under the question:
 *   - If `joined.length >= minJoinMembers` → mark `joinStatus: 'activated'`.
 *   - Else → mark `joinStatus: 'failed'` and clear `joined[]` (release intents).
 *
 * For each user who had any activist intent under this question:
 *   - Compute which of their intents ended up on activated options.
 *   - `activatedIntents === 0`     → status `orphaned`.
 *   - `> maxCommitmentsPerUser`    → status `needsPruning` (soft — UI shows a banner).
 *   - otherwise                    → status `confirmed`.
 *
 * Writes per-user state to `statements/{questionId}/joinResolutionUsers/{userId}`
 * and flips the question's `joinResolution.phase` to `'resolved'`. Irreversible.
 *
 * Organizers are NOT touched: they're always firm, never counted toward
 * `minJoinMembers`, and not cleared on failure.
 */
export const resolveJoinIntents = onCall(
	{ memory: '512MiB', region: functionConfig.region },
	async (request: CallableRequest<ResolveRequest>): Promise<ResolveSummary> => {
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		const { questionId } = request.data;
		if (!questionId) {
			throw new HttpsError('invalid-argument', 'questionId is required');
		}

		const adminUid = request.auth.uid;

		// --- Admin check: must be admin/creator of the question ---
		const subscriptionId = `${adminUid}--${questionId}`;
		const subSnap = await db.collection(Collections.statementsSubscribe).doc(subscriptionId).get();
		if (!subSnap.exists) {
			throw new HttpsError('permission-denied', 'Not subscribed to this question');
		}
		const role = subSnap.data()?.role;
		if (role !== Role.admin && role !== 'statement-creator') {
			throw new HttpsError('permission-denied', 'Only question admins can resolve intents');
		}

		// --- Load the question itself ---
		const questionRef = db.collection(Collections.statements).doc(questionId);
		const questionSnap = await questionRef.get();
		if (!questionSnap.exists) {
			throw new HttpsError('not-found', 'Question not found');
		}
		const question = questionSnap.data() as Statement;
		const resolutionConfig = question.statementSettings?.joinResolution;

		if (!resolutionConfig?.enabled) {
			throw new HttpsError('failed-precondition', 'Conditional joining is not enabled');
		}
		if (resolutionConfig.phase === 'resolved') {
			throw new HttpsError('failed-precondition', 'Intents have already been resolved');
		}

		const minJoinMembers = question.statementSettings?.minJoinMembers;
		if (typeof minJoinMembers !== 'number' || minJoinMembers < 1) {
			throw new HttpsError(
				'failed-precondition',
				'Set minJoinMembers on the question before resolving',
			);
		}
		const maxCommitmentsPerUser = resolutionConfig.maxCommitmentsPerUser;

		// --- Load all options under the question ---
		const optionsSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.where('statementType', '==', StatementType.option)
			.get();

		// userId → [optionId, optionId, ...] (activated option ids where the user had an intent)
		const userActivatedIntents = new Map<string, string[]>();
		// userId → number of ALL intents (across activated + failed) for orphaned detection
		const userTotalIntents = new Map<string, number>();

		let activatedCount = 0;
		let failedCount = 0;

		const batch = db.batch();

		for (const optionDoc of optionsSnap.docs) {
			const option = optionDoc.data() as Statement;
			const joined = option.joined ?? [];
			const count = joined.length;
			const optionId = option.statementId;

			// Track totals for orphan detection regardless of activation.
			for (const member of joined) {
				userTotalIntents.set(member.uid, (userTotalIntents.get(member.uid) ?? 0) + 1);
			}

			if (count >= minJoinMembers) {
				activatedCount++;
				batch.update(optionDoc.ref, { joinStatus: 'activated', lastUpdate: Date.now() });
				for (const member of joined) {
					const prior = userActivatedIntents.get(member.uid) ?? [];
					prior.push(optionId);
					userActivatedIntents.set(member.uid, prior);
				}
			} else {
				failedCount++;
				batch.update(optionDoc.ref, {
					joinStatus: 'failed',
					joined: [],
					lastUpdate: Date.now(),
				});
			}
		}

		// --- Per-user resolution state ---
		let confirmedCount = 0;
		let orphanedCount = 0;
		let pruningCount = 0;

		const now = Date.now();
		const resolutionUsersCol = questionRef.collection(JOIN_RESOLUTION_USERS_SUBCOLLECTION);

		for (const [userId, totalIntents] of userTotalIntents.entries()) {
			const activated = userActivatedIntents.get(userId) ?? [];
			let status: JoinResolutionUser['status'];
			if (activated.length === 0) {
				status = 'orphaned';
				orphanedCount++;
			} else if (activated.length > maxCommitmentsPerUser) {
				status = 'needsPruning';
				pruningCount++;
			} else {
				status = 'confirmed';
				confirmedCount++;
			}

			const userDoc: JoinResolutionUser = {
				userId,
				questionId,
				status,
				activatedIntents: activated,
				maxAllowed: maxCommitmentsPerUser,
				createdAt: now,
				lastUpdate: now,
			};
			batch.set(resolutionUsersCol.doc(userId), userDoc);

			// Silence unused-var warning while keeping the variable documented.
			void totalIntents;
		}

		// --- Flip the question's phase + write summary counts ---
		batch.update(questionRef, {
			'statementSettings.joinResolution.phase': 'resolved',
			'statementSettings.joinResolution.resolvedAt': now,
			'statementSettings.joinResolution.resolvedBy': adminUid,
			'statementSettings.joinResolution.activatedCount': activatedCount,
			'statementSettings.joinResolution.failedCount': failedCount,
			'statementSettings.joinResolution.orphanedCount': orphanedCount,
			'statementSettings.joinResolution.pruningCount': pruningCount,
			lastUpdate: now,
		});

		await batch.commit();

		logger.info('[resolveJoinIntents] complete', {
			questionId,
			adminUid,
			activatedCount,
			failedCount,
			confirmedCount,
			orphanedCount,
			pruningCount,
		});

		return { activatedCount, failedCount, confirmedCount, orphanedCount, pruningCount };
	},
);
