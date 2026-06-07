/**
 * AI synthesis & revision engine (§5e / architecture.md §2).
 *
 * `generateDialecticalRevision` — summarizes the debate under a claim and drafts
 * an improved version addressing the critiques; stored in `chatRevisions/{id}`
 * (keeps the shared `Statement` schema untouched).
 *
 * `acceptDialecticalRevision` — a transaction that snapshots the current text +
 * its critiques (marked `dialecticSnapshot` so the tree-builder hides them),
 * replaces the claim text with the revision, bumps `versionControl`, and resets
 * the evaluation aggregates so v2 starts with a clean slate.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import {
	Collections,
	StatementType,
	EvidenceStatus,
	functionConfig,
} from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { getGeminiModel } from '../config/gemini';
import { recomputeAncestors } from './recomputeAncestors';

const REVISIONS = 'chatRevisions';

interface RevisionDoc {
	statementId: string;
	summary: string;
	improvementSuggestion: string;
	generatedAt: number;
	digitalSourceType: 'TrainedAlgorithmicMediaDigitalSource';
}

export const generateDialecticalRevision = onCall<{ statementId: string }>(
	{ region: functionConfig.region },
	async (request) => {
		if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Auth required');
		const { statementId } = request.data;
		if (!statementId) throw new HttpsError('invalid-argument', 'statementId required');

		const db = getFirestore();
		const snap = await db.collection(Collections.statements).doc(statementId).get();
		const statement = snap.data() as Statement | undefined;
		if (!statement) throw new HttpsError('not-found', 'Statement not found');

		const childrenSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', statementId)
			.where('statementType', '==', StatementType.evidence)
			.get();
		const evidence = childrenSnap.docs.map((d) => d.data() as Statement);
		const critiques = evidence.filter((e) => e.dialecticType === 'critique');
		const strengthens = evidence.filter((e) => e.dialecticType === 'strengthen');

		const prompt = `You are improving a claim in a structured debate. Respond with STRICT JSON.

CLAIM:
"""${statement.statement}"""

STRENGTHENING EVIDENCE:
${strengthens.map((s, i) => `${i + 1}. ${s.statement}`).join('\n') || '(none)'}

CRITIQUES:
${critiques.map((c, i) => `${i + 1}. ${c.statement}`).join('\n') || '(none)'}

Return:
{
  "summary": "2-3 sentence neutral summary of the debate",
  "improvementSuggestion": "a rewritten claim that keeps the valid strengths and addresses the critiques"
}`;

		const result = await getGeminiModel().generateContent({
			contents: [{ role: 'user', parts: [{ text: prompt }] }],
			generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
		});
		const text = result.response.text();
		let summary = '';
		let improvementSuggestion = '';
		try {
			const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
			summary = String(parsed.summary ?? '');
			improvementSuggestion = String(parsed.improvementSuggestion ?? '');
		} catch {
			throw new HttpsError('internal', 'Revision generation returned invalid JSON');
		}

		const doc: RevisionDoc = {
			statementId,
			summary,
			improvementSuggestion,
			generatedAt: Date.now(),
			digitalSourceType: 'TrainedAlgorithmicMediaDigitalSource',
		};
		await db.collection(REVISIONS).doc(statementId).set(doc);

		return doc;
	},
);

export const acceptDialecticalRevision = onCall<{ statementId: string }>(
	{ region: functionConfig.region },
	async (request) => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
		const { statementId } = request.data;
		if (!statementId) throw new HttpsError('invalid-argument', 'statementId required');

		const db = getFirestore();
		const revisionSnap = await db.collection(REVISIONS).doc(statementId).get();
		const revision = revisionSnap.data() as RevisionDoc | undefined;
		if (!revision) throw new HttpsError('failed-precondition', 'No pending revision');

		const stRef = db.collection(Collections.statements).doc(statementId);

		// Snapshot id is synthetic (not a real child) so the tree-builder hides it.
		const snapshotId = `${statementId}--v`;

		await db.runTransaction(async (tx) => {
			const stSnap = await tx.get(stRef);
			const statement = stSnap.data() as Statement | undefined;
			if (!statement) throw new HttpsError('not-found', 'Statement not found');

			// Only the author (or an admin) may accept.
			if (statement.creatorId !== uid) {
				throw new HttpsError('permission-denied', 'Only the author can accept a revision');
			}

			const version = (statement.versionControl?.currentVersion ?? 1) + 1;
			const snapshotRef = db.collection(Collections.statements).doc(`${snapshotId}${version - 1}`);

			// 1. Archive the current text + version as a hidden snapshot.
			tx.set(snapshotRef, {
				...statement,
				statementId: snapshotRef.id,
				dialecticSnapshot: true,
				parentId: statementId,
				lastUpdate: Date.now(),
			});

			// 2. Replace text, bump version, reset eval aggregates for a clean slate.
			tx.update(stRef, {
				statement: revision.improvementSuggestion,
				consensus: 0,
				corroborationScore: 0,
				evidenceStatus: EvidenceStatus.pending,
				lastUpdate: Date.now(),
				lastActivityAt: Date.now(),
				versionControl: {
					...(statement.versionControl ?? {}),
					currentVersion: version,
					appliedAt: Date.now(),
				},
			});
		});

		// 3. Re-parent existing critiques to the snapshot so they're "resolved"
		//    and hidden from the main feed (marked as snapshots).
		const childrenSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', statementId)
			.where('statementType', '==', StatementType.evidence)
			.get();
		const batch = db.batch();
		for (const doc of childrenSnap.docs) {
			batch.update(doc.ref, { dialecticSnapshot: true, lastUpdate: Date.now() });
		}
		await batch.commit();

		await db.collection(REVISIONS).doc(statementId).delete();
		await recomputeAncestors(statementId);

		return { statementId, accepted: true };
	},
);
