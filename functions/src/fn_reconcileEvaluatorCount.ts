import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from './config/cors';
import { db } from './index';
import { assertAdmin } from './fn_recomputeTopOptions';
import { reconcileParentEvaluators } from './evaluation/evaluatorParticipation';
import type { ReconcileResult } from './evaluation/evaluatorParticipation';
import { logError } from './utils/errorHandling';

/**
 * Recompute one question's evaluator count from scratch, on demand.
 *
 * The evaluation triggers keep `asParentTotalEvaluators` / `totalEvaluators`
 * up to date incrementally (see evaluation/evaluatorParticipation.ts). This
 * admin-only callable is the repair tool: it rescans the question's
 * evaluations, rebuilds the per-user participation markers and writes the
 * exact count. It is a full scan, so it never runs automatically.
 */

export interface ReconcileEvaluatorCountRequest {
	statementId: string;
}

export interface ReconcileEvaluatorCountResult extends ReconcileResult {
	success: boolean;
}

/** The callable's body, split out so it can be unit-tested without the runtime. */
export async function applyReconcileEvaluatorCount(
	firestore: Firestore,
	uid: string | undefined,
	data: ReconcileEvaluatorCountRequest | undefined,
): Promise<ReconcileEvaluatorCountResult> {
	if (!uid) {
		throw new HttpsError('unauthenticated', 'User must be authenticated');
	}

	const statementId = data?.statementId;
	if (!statementId) {
		throw new HttpsError('invalid-argument', 'statementId is required');
	}

	await assertAdmin(firestore, statementId, uid);

	try {
		const result = await reconcileParentEvaluators(statementId, firestore);

		return { success: true, ...result };
	} catch (error) {
		logError(error, {
			operation: 'reconcileEvaluatorCount',
			userId: uid,
			statementId,
		});
		throw new HttpsError('internal', 'Failed to reconcile the evaluator count');
	}
}

export const reconcileEvaluatorCount = onCall<ReconcileEvaluatorCountRequest>(
	{
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
		timeoutSeconds: 300,
	},
	(request): Promise<ReconcileEvaluatorCountResult> =>
		applyReconcileEvaluatorCount(db, request.auth?.uid, request.data),
);
