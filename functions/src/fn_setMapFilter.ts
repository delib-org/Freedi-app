import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import type { Firestore } from 'firebase-admin/firestore';
import { db } from './index';
import { Collections, functionConfig, MapFilterMetric, StatementType } from '@freedi/shared-types';

export interface SetMapFilterRequest {
	statementId: string;
	filterMetric: MapFilterMetric;
	minConsensus: number;
	minAverageEvaluation: number;
}

export interface SetMapFilterResult {
	success: boolean;
}

const VALID_METRICS: MapFilterMetric[] = ['none', 'consensus', 'average'];
const THRESHOLD_MIN = -1;
const THRESHOLD_MAX = 1;

function clampThreshold(value: unknown): number {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) return THRESHOLD_MIN;

	return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, n));
}

/**
 * Core logic for persisting a NON-admin viewer's cluster-map filter — split out
 * from the onCall wrapper so it can be unit-tested. Validates the request,
 * confirms the question has opted `allowViewerFilter` open, and writes ONLY the
 * three filter fields into statementSettings.map.
 */
export async function applyMapFilter(
	firestore: Firestore,
	uid: string | undefined,
	data: SetMapFilterRequest,
): Promise<SetMapFilterResult> {
	if (!uid) {
		throw new HttpsError('unauthenticated', 'User must be authenticated');
	}

	const { statementId, filterMetric, minConsensus, minAverageEvaluation } = data;

	if (!statementId) {
		throw new HttpsError('invalid-argument', 'statementId is required');
	}
	if (!VALID_METRICS.includes(filterMetric)) {
		throw new HttpsError('invalid-argument', 'filterMetric is invalid');
	}

	const statementRef = firestore.collection(Collections.statements).doc(statementId);
	const statementDoc = await statementRef.get();
	if (!statementDoc.exists) {
		throw new HttpsError('not-found', 'Statement not found');
	}

	const statement = statementDoc.data();
	if (statement?.statementType !== StatementType.question) {
		throw new HttpsError('failed-precondition', 'Map filter applies to questions only');
	}

	// The admin must have opted the filter open to viewers.
	const allowViewerFilter = statement?.statementSettings?.map?.allowViewerFilter === true;
	if (!allowViewerFilter) {
		throw new HttpsError('permission-denied', 'Viewer filtering is not enabled for this map');
	}

	await statementRef.set(
		{
			statementSettings: {
				map: {
					filterMetric,
					minConsensus: clampThreshold(minConsensus),
					minAverageEvaluation: clampThreshold(minAverageEvaluation),
				},
			},
		},
		{ merge: true },
	);

	logger.info(`setMapFilter: ${statementId} → ${filterMetric} by ${uid}`);

	return { success: true };
}

/**
 * Persist the cluster-map response filter on behalf of a NON-admin viewer.
 *
 * Firestore rules treat any `statementSettings` change as protected, so a
 * non-admin cannot write it directly. Admins write it directly from the client;
 * permitted viewers call this.
 */
export const setMapFilter = onCall<SetMapFilterRequest>(
	{ region: functionConfig.region },
	(request): Promise<SetMapFilterResult> => applyMapFilter(db, request.auth?.uid, request.data),
);
