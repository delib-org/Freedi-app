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
	descendantCount: number;
	/** Fingerprint of the subtree when this summary was generated (cache key). */
	subtreeFingerprint: string;
}

/** Max sub-statements fed to the model (keeps the prompt within token limits). */
const MAX_DESCENDANTS = 200;

/**
 * A stable fingerprint of the subtree: count + a hash of every live descendant's
 * `id:lastUpdate`. Adding, removing, editing, or re-scoring a sub-statement all
 * bump `lastUpdate` (or change the set), so any real change flips the hash —
 * letting us skip regeneration when nothing below changed.
 */
function subtreeFingerprint(descendants: Statement[]): string {
	const live = descendants.filter((s) => !s.dialecticSnapshot);
	const parts = live.map((s) => `${s.statementId}:${s.lastUpdate ?? 0}`).sort();
	const str = parts.join('|');
	let h = 5381;
	for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;

	return `${live.length}-${h.toString(36)}`;
}

/**
 * Build an indented digest of the ENTIRE subtree under `rootId` — every
 * sub-statement (options, strengthen/critique evidence, chatter, sub-questions),
 * recursively — labelled by kind/polarity and corroboration so the model can
 * summarise the whole debate, not just the direct evidence.
 */
function buildSubtreeDigest(root: Statement, descendants: Statement[]): { digest: string; count: number } {
	const byParent = new Map<string, Statement[]>();
	for (const s of descendants) {
		if (s.dialecticSnapshot) continue; // skip archived revision snapshots
		const list = byParent.get(s.parentId);
		if (list) list.push(s);
		else byParent.set(s.parentId, [s]);
	}

	const lines: string[] = [];
	let count = 0;

	const label = (s: Statement): string => {
		if (s.statementType === StatementType.option) return 'OPTION';
		if (s.statementType === StatementType.question) return 'SUB-QUESTION';
		if (s.statementType === StatementType.evidence) {
			const c =
				typeof s.corroborationScore === 'number'
					? ` C=${Math.round(s.corroborationScore * 100)}%`
					: '';

			return `${s.dialecticType === 'critique' ? 'CRITIQUE' : 'STRENGTHEN'}${c}`;
		}

		return 'COMMENT';
	};

	const walk = (parentId: string, depth: number): void => {
		if (count >= MAX_DESCENDANTS) return;
		const kids = byParent.get(parentId) ?? [];
		for (const kid of kids) {
			if (count >= MAX_DESCENDANTS) return;
			count++;
			lines.push(`${'  '.repeat(depth)}- [${label(kid)}] ${kid.statement}`);
			walk(kid.statementId, depth + 1);
		}
	};

	walk(root.statementId, 0);

	return { digest: lines.join('\n') || '(no replies yet)', count };
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

		// Gather the FULL subtree: every descendant carries this id in `parents`.
		const descSnap = await db
			.collection(Collections.statements)
			.where('parents', 'array-contains', statementId)
			.get();
		const descendants = descSnap.docs.map((d) => d.data() as Statement);

		// Skip regeneration if nothing below this claim changed since last time.
		const fingerprint = subtreeFingerprint(descendants);
		const existingSnap = await db.collection(REVISIONS).doc(statementId).get();
		const existing = existingSnap.data() as RevisionDoc | undefined;
		if (existing && existing.summary && existing.subtreeFingerprint === fingerprint) {
			return { ...existing, cached: true };
		}

		const { digest, count } = buildSubtreeDigest(statement, descendants);

		const prompt = `You are an analyst summarising a structured dialectical debate.
Below a CLAIM is its full thread of sub-statements (options, strengthening
evidence, critiques, comments, sub-questions), indented by depth. Read the WHOLE
thread, then respond with STRICT JSON.

CLAIM:
"""${statement.statement}"""

FULL THREAD (${count} sub-statements):
${digest}

Return:
{
  "summary": "3-4 sentence neutral summary of the entire debate below this claim — what strengthens it, what the strongest critiques are, and where it currently stands",
  "improvementSuggestion": "a rewritten version of the CLAIM that keeps the valid strengths and addresses the strongest critiques raised anywhere in the thread"
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
			descendantCount: count,
			subtreeFingerprint: fingerprint,
		};
		await db.collection(REVISIONS).doc(statementId).set(doc);

		return { ...doc, cached: false };
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
