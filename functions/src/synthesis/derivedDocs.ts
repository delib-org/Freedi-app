import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { Collections, Statement } from '@freedi/shared-types';
import { logger } from 'firebase-functions';
import { reverseIntegration } from '../integrate/reverseIntegration';

/**
 * Shared helpers for identifying and clearing synthesis-derived documents, so a
 * bulk run is idempotent: clean-then-rebuild instead of piling new synths on top
 * of old ones.
 *
 * The production incident that motivated this: multiple uncleaned runs of
 * different mechanisms left 95 derived docs under one question, 78 of them with
 * NO `derivedByPipeline` tag — so a tag-only cleanup could not find them and they
 * accumulated, while 26 member options were hidden with no recovery link.
 *
 * `isDerived` is deliberately INCLUSIVE so it catches legacy/untagged outputs:
 * any of `integratedOptions` (non-empty), `isCluster`, `derivedByPipeline`, or
 * `liveSynthOrigin` marks a doc as synthesis output. Real user options carry
 * none of these.
 *
 * See docs/clusters and synthesis/bulk-synthesis-production-architecture.md §6.
 */

/** Loose view of the synthesis-provenance fields that may not all be on the typed Statement. */
type DerivedFields = {
	integratedOptions?: string[];
	isCluster?: boolean;
	derivedByPipeline?: string;
	liveSynthOrigin?: string;
	integratedInto?: string;
	hide?: boolean;
};

/**
 * True iff the statement is a synthesis output (synth, topic-cluster, or a
 * legacy/untagged derived doc) rather than a genuine user-submitted option.
 */
export function isDerived(statement: Statement): boolean {
	const s = statement as Statement & DerivedFields;

	return (
		(Array.isArray(s.integratedOptions) && s.integratedOptions.length > 0) ||
		s.isCluster === true ||
		!!s.derivedByPipeline ||
		!!s.liveSynthOrigin
	);
}

export interface DissolveResult {
	/** Proper clusters reversed via `reverseIntegration` (members restored, evals handled, cluster deleted). */
	clustersReversed: number;
	/** Malformed/legacy derived docs deleted because they aren't reversible clusters. */
	docsArchived: number;
	/** Member options re-shown after deleting a malformed derived doc. */
	membersRestored: number;
	/** Real options that were hidden with no `integratedInto` (orphaned) and got re-shown. */
	orphansRestored: number;
}

export interface DissolveOptions {
	/** Attributed to reversal audit fields. Defaults to 'system-synthesis-cleanup'. */
	reversedByUserId?: string;
	/** When true, classify and report but write nothing. */
	dryRun?: boolean;
}

/**
 * Clear ALL synthesis output under a question and restore its real options to a
 * pristine, visible state — the clean step that makes a bulk re-run idempotent.
 *
 *  1. Proper clusters (`isCluster && integratedOptions`) → `reverseIntegration`
 *     (un-hides members, hard-deletes the cluster, undoes migrated evaluations).
 *  2. Malformed/legacy derived docs (caught by `isDerived` but not a clean
 *     cluster: untagged, 0-member topic headers) → deleted + their members,
 *     if any, re-shown.
 *  3. Orphaned hidden options (real options hidden with no `integratedInto`) →
 *     re-shown.
 */
export async function dissolveQuestionSynthesis(
	questionId: string,
	options: DissolveOptions = {},
): Promise<DissolveResult> {
	const reversedByUserId = options.reversedByUserId ?? 'system-synthesis-cleanup';
	const dryRun = options.dryRun ?? false;
	const db = getFirestore();
	const now = Date.now();

	const snap = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionId)
		.where('statementType', '==', 'option')
		.get();
	const docs = snap.docs.map((d) => d.data() as Statement & DerivedFields);

	const properClusters = docs.filter(
		(d) =>
			d.isCluster === true && Array.isArray(d.integratedOptions) && d.integratedOptions.length > 0,
	);
	const properClusterIds = new Set(properClusters.map((d) => d.statementId));
	const malformedDerived = docs.filter((d) => isDerived(d) && !properClusterIds.has(d.statementId));
	const realOptions = docs.filter((d) => !isDerived(d));
	const orphanedHidden = realOptions.filter((d) => d.hide === true && !d.integratedInto);

	const result: DissolveResult = {
		clustersReversed: 0,
		docsArchived: 0,
		membersRestored: 0,
		orphansRestored: 0,
	};

	if (dryRun) {
		result.clustersReversed = properClusters.length;
		result.docsArchived = malformedDerived.length;
		// best-effort member estimate for the dry-run summary
		const malformedMembers = new Set(malformedDerived.flatMap((d) => d.integratedOptions ?? []));
		result.membersRestored = malformedMembers.size;
		result.orphansRestored = orphanedHidden.length;

		return result;
	}

	// 1. Reverse proper clusters (handles member restore + evaluation migration).
	//    Hard-delete the cluster doc — re-cluster wants a clean slate, and a
	//    soft-hide would leave ghost nodes in the tree view (which ignores `hide`).
	for (const cluster of properClusters) {
		try {
			await reverseIntegration({
				clusterStatementId: cluster.statementId,
				reversedByUserId,
				deleteCluster: true,
			});
			result.clustersReversed++;
		} catch (error) {
			logger.warn('dissolveQuestionSynthesis: reverseIntegration failed; archiving instead', {
				questionId,
				clusterId: cluster.statementId,
				error: error instanceof Error ? error.message : String(error),
			});
			malformedDerived.push(cluster); // fall through to archival below
		}
	}

	// 2. Delete malformed/legacy derived docs and re-show their members. We
	//    hard-delete (not hide) so stale headers leave Firestore entirely and
	//    cannot resurface in the tree view, which does not filter `hide`.
	const realById = new Map(realOptions.map((d) => [d.statementId, d]));
	for (let i = 0; i < malformedDerived.length; i += 400) {
		const batch = db.batch();
		const slice = malformedDerived.slice(i, i + 400);
		for (const doc of slice) {
			const ref = db.collection(Collections.statements).doc(doc.statementId);
			batch.delete(ref);
			for (const memberId of doc.integratedOptions ?? []) {
				const member = realById.get(memberId);
				if (member && member.hide === true) {
					const mref = db.collection(Collections.statements).doc(memberId);
					batch.update(mref, { hide: false, integratedInto: FieldValue.delete(), lastUpdate: now });
					result.membersRestored++;
				}
			}
		}
		await batch.commit();
		result.docsArchived += slice.length;
	}

	// 3. Re-show orphaned hidden real options.
	for (let i = 0; i < orphanedHidden.length; i += 400) {
		const batch = db.batch();
		for (const doc of orphanedHidden.slice(i, i + 400)) {
			const ref = db.collection(Collections.statements).doc(doc.statementId);
			batch.update(ref, { hide: false, integratedInto: FieldValue.delete(), lastUpdate: now });
		}
		await batch.commit();
		result.orphansRestored += Math.min(400, orphanedHidden.length - i);
	}

	if (result.clustersReversed + result.docsArchived + result.orphansRestored > 0) {
		await db.collection(Collections.statements).doc(questionId).update({
			lastChildUpdate: now,
			lastUpdate: now,
		});
	}

	logger.info('dissolveQuestionSynthesis: complete', { questionId, ...result });

	return result;
}
