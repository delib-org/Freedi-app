import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, Role, Statement, functionConfig } from '@freedi/shared-types';
import { logger } from 'firebase-functions';
import { ALLOWED_ORIGINS } from './config/cors';
import { db } from './index';
import { updateParentStatementWithChosenOptions } from './evaluation/updateChosenOptions';

/**
 * Recompute a question's "top answers" on demand.
 *
 * `statement.results` / the per-option `isChosen` flag are what every surface in
 * the main app uses to mark a top answer (SuggestionCard, TreeOptionNode,
 * StageCard, the mind map). They are produced by
 * `updateParentStatementWithChosenOptions`, which until now only ever ran from
 * the evaluation triggers — so changing `resultsSettings` (rank-by, top-N vs
 * threshold, the cutoff value) left the marks stale until somebody happened to
 * rate something next.
 *
 * This callable closes that gap: the Top Answers admin panel calls it after a
 * settings write so the marks follow the admin's change immediately. It adds no
 * computation of its own — it is an admin-gated entry point to the existing one.
 */

export interface RecomputeTopOptionsRequest {
	statementId: string;
}

export interface RecomputeTopOptionsResult {
	success: boolean;
	statementId: string;
}

/**
 * Admin gate. Mirrors `assertAdmin` in `fn_synthesizeIdeas.ts`: authorization is
 * held at the top-parent level, so the subscription lookup resolves against
 * `topParentId`, falling back to the statement itself when it *is* the root.
 */
async function assertAdmin(
	firestore: Firestore,
	statementId: string,
	userId: string,
): Promise<Statement> {
	const statementDoc = await firestore.collection(Collections.statements).doc(statementId).get();
	if (!statementDoc.exists) {
		throw new HttpsError('not-found', 'Statement not found');
	}
	const statement = statementDoc.data() as Statement;
	const topParentId = statement.topParentId || statementId;

	const membersSnapshot = await firestore
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', topParentId)
		.where('userId', '==', userId)
		.where('role', 'in', [Role.admin, 'creator', 'admin'])
		.limit(1)
		.get();

	if (membersSnapshot.empty) {
		throw new HttpsError('permission-denied', 'Only admins can recompute top answers');
	}

	return statement;
}

/**
 * The callable's body, split out from the onCall wrapper so it can be
 * unit-tested without booting the Cloud Functions runtime.
 */
export async function applyRecomputeTopOptions(
	firestore: Firestore,
	uid: string | undefined,
	data: RecomputeTopOptionsRequest | undefined,
): Promise<RecomputeTopOptionsResult> {
	if (!uid) {
		throw new HttpsError('unauthenticated', 'User must be authenticated');
	}

	const statementId = data?.statementId;
	if (!statementId) {
		throw new HttpsError('invalid-argument', 'statementId is required');
	}

	await assertAdmin(firestore, statementId, uid);

	try {
		await updateParentStatementWithChosenOptions(statementId);
	} catch (error) {
		logger.error('recomputeTopOptions: recompute failed', { statementId, error });
		throw new HttpsError('internal', 'Failed to recompute top answers');
	}

	return { success: true, statementId };
}

export const recomputeTopOptions = onCall<RecomputeTopOptionsRequest>(
	{
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	(request): Promise<RecomputeTopOptionsResult> =>
		applyRecomputeTopOptions(db, request.auth?.uid, request.data),
);
