/**
 * `rescoreStatement` (§5c) — admin/offline calibration callable. Re-runs a
 * scorer over a statement and writes a **new** verdict doc non-destructively
 * (never flips the active verdict unless explicitly promoted). Calibration infra
 * for replaying history against a new scorer version.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, StatementType, functionConfig } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { getScorer, type DialecticPolarity } from '@freedi/evidence';
import './scorerV1'; // registers evidenceScorerV1

const VERDICTS = 'evidenceVerdicts';

interface RescoreRequest {
	statementId: string;
	scorerVersion?: string;
}

export const rescoreStatement = onCall<RescoreRequest>(
	{ region: functionConfig.region },
	async (request) => {
		if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Auth required');
		const { statementId, scorerVersion } = request.data;
		if (!statementId) throw new HttpsError('invalid-argument', 'statementId required');

		const db = getFirestore();
		const snap = await db.collection(Collections.statements).doc(statementId).get();
		const statement = snap.data() as Statement | undefined;
		if (!statement) throw new HttpsError('not-found', 'Statement not found');
		if (statement.statementType !== StatementType.evidence) {
			throw new HttpsError('failed-precondition', 'Only evidence nodes are scored');
		}

		const parentSnap = await db.collection(Collections.statements).doc(statement.parentId).get();
		const parent = parentSnap.data() as Statement | undefined;
		if (!parent) throw new HttpsError('not-found', 'Parent not found');

		const scorer = getScorer(scorerVersion);
		const verdict = await scorer.score({
			parentText: parent.statement,
			statementText: statement.statement,
			threadContext: parent.replyTo?.statement,
			userPillHint: (statement.dialecticType as DialecticPolarity) ?? 'standard',
		});

		await db
			.collection(VERDICTS)
			.doc(statementId)
			.collection('versions')
			.doc(scorer.version)
			.set({ ...verdict, statementId, scorerVersion: scorer.version, createdAt: Date.now() });

		return { scorerVersion: scorer.version, verdict };
	},
);
