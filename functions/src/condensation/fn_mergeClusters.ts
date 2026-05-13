import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, Statement, functionConfig } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { recomputeClusterEvaluation } from './aggregation';

const db = getFirestore();

interface MergeClustersRequest {
	parentId: string;
	/** Cluster that keeps its title/ID and absorbs members of the others. */
	intoClusterId: string;
	/** Clusters to fold into `intoClusterId`. These docs are deleted. */
	fromClusterIds: string[];
}

interface MergeClustersResult {
	success: true;
	mergedClusterId: string;
	absorbedClusterIds: string[];
	totalMembers: number;
}

/**
 * Callable: fold one or more cluster statements into a target cluster.
 *
 * - Combines `integratedOptions` (union, deduped) into the target cluster
 * - Deletes the absorbed cluster docs
 * - Rewrites `parent.creatorOverrides.assignments` so any original forced
 *   into an absorbed cluster now points at the target
 * - Deletes every `clusterEvaluationLinks` doc for the absorbed clusters
 *   (the target's links are rebuilt by `recomputeClusterEvaluation`)
 * - Re-aggregates the target cluster's evaluation from the union of
 *   member evaluations
 *
 * Only the parent question's creator may call this.
 */
export const mergeClusters = onCall<MergeClustersRequest>(
	{ region: functionConfig.region },
	async (request): Promise<MergeClustersResult> => {
		if (!request.auth?.uid) {
			throw new HttpsError('unauthenticated', 'Sign in required');
		}

		const { parentId, intoClusterId, fromClusterIds } = request.data ?? {
			parentId: '',
			intoClusterId: '',
			fromClusterIds: [],
		};

		if (!parentId || !intoClusterId) {
			throw new HttpsError('invalid-argument', 'parentId and intoClusterId are required');
		}
		if (!Array.isArray(fromClusterIds) || fromClusterIds.length === 0) {
			throw new HttpsError('invalid-argument', 'fromClusterIds must be a non-empty array');
		}
		if (fromClusterIds.includes(intoClusterId)) {
			throw new HttpsError(
				'invalid-argument',
				'intoClusterId cannot also appear in fromClusterIds',
			);
		}

		const uid = request.auth.uid;

		try {
			// Authorization: parent creator only. Admin-via-subscription can be
			// added later by mirroring the check in recalculateStatementEvaluations.
			const parentRef = db.collection(Collections.statements).doc(parentId);
			const parentSnap = await parentRef.get();
			if (!parentSnap.exists) {
				throw new HttpsError('not-found', 'Parent statement not found');
			}
			const parent = parentSnap.data() as Statement;
			if (parent.creatorId !== uid) {
				throw new HttpsError('permission-denied', 'Only the question creator may merge clusters');
			}

			// Load all target + source cluster docs in parallel.
			const [intoSnap, ...fromSnaps] = await Promise.all([
				db.collection(Collections.statements).doc(intoClusterId).get(),
				...fromClusterIds.map((id) => db.collection(Collections.statements).doc(id).get()),
			]);

			if (!intoSnap.exists) {
				throw new HttpsError('not-found', `Target cluster ${intoClusterId} not found`);
			}
			const intoCluster = intoSnap.data() as Statement;
			if (intoCluster.isCluster !== true) {
				throw new HttpsError('failed-precondition', 'Target is not a cluster');
			}
			if (intoCluster.parentId !== parentId) {
				throw new HttpsError(
					'failed-precondition',
					'Target cluster is not a child of the given parent',
				);
			}

			const fromClusters: Statement[] = [];
			for (let i = 0; i < fromSnaps.length; i++) {
				const snap = fromSnaps[i];
				const id = fromClusterIds[i];
				if (!snap.exists) {
					logger.warn('mergeClusters: absorbed cluster already missing, skipping', { id });
					continue;
				}
				const data = snap.data() as Statement;
				if (data.isCluster !== true) {
					throw new HttpsError('failed-precondition', `${id} is not a cluster`);
				}
				if (data.parentId !== parentId) {
					throw new HttpsError('failed-precondition', `${id} is not a child of the given parent`);
				}
				fromClusters.push(data);
			}

			// Union the integratedOptions (dedup, preserve target's order).
			const unionIds = new Set<string>(intoCluster.integratedOptions ?? []);
			for (const fc of fromClusters) {
				for (const id of fc.integratedOptions ?? []) {
					unionIds.add(id);
				}
			}
			const mergedMembers = Array.from(unionIds);

			// Rewrite creatorOverrides: any assignment pointing at a source
			// cluster is rewritten to point at the target.
			const assignments =
				(parent.creatorOverrides?.assignments as Record<string, string> | undefined) ?? {};
			const remappedAssignments: Record<string, string> = {};
			const fromSet = new Set(fromClusterIds);
			let assignmentsChanged = false;
			for (const [originalId, targetId] of Object.entries(assignments)) {
				if (fromSet.has(targetId)) {
					remappedAssignments[originalId] = intoClusterId;
					assignmentsChanged = true;
				} else {
					remappedAssignments[originalId] = targetId;
				}
			}

			// --- WRITES -------------------------------------------------------
			// All-or-nothing for the three cluster-level writes. Provenance
			// links for the absorbed clusters are cleaned up separately (batch
			// of 400 ops); the target's links are rebuilt by the aggregator.

			const batch = db.batch();

			// 1. Update the target cluster's integratedOptions.
			batch.update(intoSnap.ref, {
				integratedOptions: mergedMembers,
				lastUpdate: Date.now(),
			});

			// 2. Delete each absorbed cluster doc.
			for (const fc of fromClusters) {
				const ref = db.collection(Collections.statements).doc(fc.statementId);
				batch.delete(ref);
			}

			// 3. Re-point creatorOverrides (only if anything changed).
			if (assignmentsChanged) {
				batch.update(parentRef, {
					creatorOverrides: {
						assignments: remappedAssignments,
						updatedAt: Date.now(),
					},
					lastUpdate: Date.now(),
				});
			}

			await batch.commit();

			// 4. Cascade-delete provenance links for the absorbed clusters.
			//    Do NOT delete the target's links — the aggregator rebuilds them.
			const LINK_BATCH_CAP = 400;
			for (const fc of fromClusters) {
				try {
					const linksSnap = await db
						.collection(Collections.clusterEvaluationLinks)
						.where('clusterId', '==', fc.statementId)
						.get();
					for (let i = 0; i < linksSnap.docs.length; i += LINK_BATCH_CAP) {
						const chunk = linksSnap.docs.slice(i, i + LINK_BATCH_CAP);
						const linkBatch = db.batch();
						chunk.forEach((d) => linkBatch.delete(d.ref));
						await linkBatch.commit();
					}
				} catch (error) {
					logError(error, {
						operation: 'mergeClusters.cleanupLinks',
						statementId: fc.statementId,
					});
					// Continue — stale links are self-pruned on next aggregator run.
				}
			}

			// 5. Re-aggregate the target cluster's evaluation from the union.
			try {
				await recomputeClusterEvaluation(intoClusterId);
			} catch (error) {
				logError(error, {
					operation: 'mergeClusters.recompute',
					statementId: intoClusterId,
				});
				// Non-fatal — the next evaluation write will retrigger the
				// aggregator and bring the cluster back into sync.
			}

			logger.info('mergeClusters done', {
				parentId,
				intoClusterId,
				absorbedClusterIds: fromClusters.map((c) => c.statementId),
				totalMembers: mergedMembers.length,
			});

			return {
				success: true,
				mergedClusterId: intoClusterId,
				absorbedClusterIds: fromClusters.map((c) => c.statementId),
				totalMembers: mergedMembers.length,
			};
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, { operation: 'mergeClusters', statementId: intoClusterId });
			throw new HttpsError('internal', 'Failed to merge clusters');
		}
	},
);
