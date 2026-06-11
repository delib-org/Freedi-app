import { logger } from 'firebase-functions';
import { Collections, getRandomUID, StatementType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import {
	computeClusterEvaluationFromRawEvals,
	fetchEvaluationsForIds,
} from '../../condensation/aggregation';
import { getFirestore, WriteBatch } from 'firebase-admin/firestore';
import { FIRESTORE_BATCH_SIZE, PIPELINE_ID } from './constants';
import type { ClusterGroup, ClusterableItem, NormalizedResponse, RawResponse } from './types';

interface PoolAttachment {
	statementId: string;
	groupId: string | null;
}

export interface WriterInput {
	parent: Statement;
	allResponses: RawResponse[]; // every response we loaded (core + short + noise)
	normalized: NormalizedResponse[]; // core only — has actions[]
	items: ClusterableItem[]; // flat list of canonical actions across categories
	groups: ClusterGroup[]; // every cluster group across categories (incl. uncategorized)
	poolAttachments: PoolAttachment[]; // short + noise mapping decisions
	dryRun: boolean;
}

export interface WriterOutput {
	clustersCreated: number;
	syntheticOptionsCreated: number;
	assignedToCluster: number;
	uncategorized: number;
}

/**
 * Helper: chunk an array of write operations and commit each in its own batch.
 */
async function commitInBatches(ops: Array<(batch: WriteBatch) => void>): Promise<void> {
	const db = getFirestore();
	for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_SIZE) {
		const batch = db.batch();
		const slice = ops.slice(i, i + FIRESTORE_BATCH_SIZE);
		for (const op of slice) op(batch);
		await batch.commit();
	}
}

/**
 * Idempotency: delete the prior run's artifacts before writing the new ones.
 * Both the cluster Statements and the synthetic options created by this pipeline
 * are tagged `derivedByPipeline === PIPELINE_ID`, so a single query finds them.
 * Membership lives in each cluster's `integratedOptions`, so original options
 * need no per-cluster field to clear.
 */
async function teardownPrior(parentId: string): Promise<boolean> {
	const db = getFirestore();
	const prior = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('derivedByPipeline', '==', PIPELINE_ID)
		.get();

	const ops: Array<(b: WriteBatch) => void> = [];
	for (const doc of prior.docs) ops.push((b) => b.delete(doc.ref));
	await commitInBatches(ops);

	return !prior.empty;
}

/**
 * Build a synthetic-option Statement from an original response + an action.
 * `actionIndex >= 1` only — actionIndex 0 is the original Statement itself.
 */
function buildSyntheticOption(
	original: Statement,
	parent: Statement,
	canonicalSentence: string,
): Record<string, unknown> {
	const id = getRandomUID();

	return {
		statement: canonicalSentence,
		statementId: id,
		parentId: parent.statementId,
		parents: [...(parent.parents || []), parent.statementId],
		topParentId: parent.topParentId,
		statementType: StatementType.option,
		createdAt: Date.now(),
		lastUpdate: Date.now(),
		creator: original.creator,
		creatorId: original.creatorId,
		consensus: 0,
		randomSeed: Math.random(),
		derivedFromStatementId: original.statementId,
		derivedByPipeline: PIPELINE_ID,
	};
}

/**
 * Build a cluster Statement (isCluster=true) for a group. Identified by
 * `derivedByPipeline === 'topic-cluster'`; membership is carried by
 * `integratedOptions` (set by the caller).
 */
function buildClusterStatement(
	parent: Statement,
	displayName: string,
): { id: string; data: Record<string, unknown> } {
	const id = getRandomUID();

	return {
		id,
		data: {
			statement: displayName,
			isCluster: true,
			statementId: id,
			parentId: parent.statementId,
			parents: [...(parent.parents || []), parent.statementId],
			topParentId: parent.topParentId,
			statementType: StatementType.option,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
			creator: parent.creator,
			creatorId: parent.creatorId,
			consensus: 0,
			randomSeed: Math.random(),
			derivedByPipeline: PIPELINE_ID,
		},
	};
}

/**
 * Main writer. Idempotent: tears down prior topic-cluster state before writing new.
 *
 * On compound responses (`actions.length > 1`), the original Statement is
 * mapped to the FIRST action's cluster, and additional synthetic options are
 * created (one per extra action) and mapped to their respective clusters.
 */
export async function upsertTopicClusters(input: WriterInput): Promise<WriterOutput> {
	const { parent, allResponses, normalized, items, groups, poolAttachments, dryRun } = input;
	const db = getFirestore();
	const parentId = parent.statementId;

	// Build per-statement action plan (the response → cluster mapping).
	const itemIndexToGroup = new Map<number, string>();
	for (const g of groups) {
		for (const idx of g.memberIndices) itemIndexToGroup.set(idx, g.groupId);
	}
	const actionToGroup = new Map<string, string>(); // key `${statementId}_${actionIndex}` → groupId
	for (let i = 0; i < items.length; i++) {
		const groupId = itemIndexToGroup.get(i);
		if (groupId) {
			actionToGroup.set(`${items[i].sourceStatementId}_${items[i].actionIndex}`, groupId);
		}
	}

	// Plan output counters.
	let assignedToCluster = 0;
	let uncategorized = 0;
	let syntheticOptionsCreated = 0;

	const hadPrior = dryRun ? false : await teardownPrior(parentId);

	// Build cluster Statements (one per non-empty group, including uncategorized if any).
	const groupIdToClusterDocId = new Map<string, string>();
	const clusterCreates: Array<{ id: string; data: Record<string, unknown> }> = [];

	for (const group of groups) {
		if (group.memberIndices.length === 0) continue;
		const displayName = group.displayName ?? 'Cluster';
		const built = buildClusterStatement(parent, displayName);
		clusterCreates.push(built);
		groupIdToClusterDocId.set(group.groupId, built.id);
	}

	// Walk normalized responses and decide:
	// - actionIndex 0 → the ORIGINAL is a cluster member.
	// - actionIndex > 0 → create a synthetic option mapped to its cluster.
	const responseLookup = new Map<string, RawResponse>();
	for (const r of allResponses) responseLookup.set(r.statementId, r);

	const optionUpdates: Array<{ id: string; clusterDocId: string }> = [];
	const syntheticCreates: Array<{
		id: string;
		data: Record<string, unknown>;
		clusterDocId: string;
	}> = [];

	for (const norm of normalized) {
		const original = responseLookup.get(norm.statementId);
		if (!original) continue;
		for (let ai = 0; ai < norm.actions.length; ai++) {
			const groupId = actionToGroup.get(`${norm.statementId}_${ai}`);
			if (!groupId) continue;
			const clusterDocId = groupIdToClusterDocId.get(groupId);
			if (!clusterDocId) {
				// Group with zero members survived (shouldn't happen) or was uncategorized
				if (groupId.endsWith('_uncategorized')) uncategorized++;
				continue;
			}
			if (ai === 0) {
				// Original Statement is a member.
				optionUpdates.push({ id: norm.statementId, clusterDocId });
				assignedToCluster++;
			} else {
				// Create synthetic option.
				const action = norm.actions[ai];
				const built = buildSyntheticOption(original.statement, parent, action.canonicalSentence);
				syntheticCreates.push({
					id: built.statementId as string,
					data: built,
					clusterDocId,
				});
				syntheticOptionsCreated++;
				assignedToCluster++;
			}
		}
	}

	// Pool attachments (short + noise) → map to cluster's host original Statement.
	for (const attachment of poolAttachments) {
		if (!attachment.groupId) continue;
		const clusterDocId = groupIdToClusterDocId.get(attachment.groupId);
		if (!clusterDocId) continue;
		optionUpdates.push({ id: attachment.statementId, clusterDocId });
		assignedToCluster++;
	}

	// Bucket every option (original + synthetic) by the cluster it's mapped to.
	// `integratedOptions` is the source of truth for cluster membership in the UI.
	// Originals contribute to the evaluation rollup; synthetics are listed for
	// completeness but contribute zero evaluations (they're newborn).
	const allMembersByCluster = new Map<string, string[]>();
	const originalMembersByCluster = new Map<string, string[]>();
	for (const u of optionUpdates) {
		const all = allMembersByCluster.get(u.clusterDocId) ?? [];
		all.push(u.id);
		allMembersByCluster.set(u.clusterDocId, all);
		const originals = originalMembersByCluster.get(u.clusterDocId) ?? [];
		originals.push(u.id);
		originalMembersByCluster.set(u.clusterDocId, originals);
	}
	for (const s of syntheticCreates) {
		const all = allMembersByCluster.get(s.clusterDocId) ?? [];
		all.push(s.id);
		allMembersByCluster.set(s.clusterDocId, all);
	}

	// Set integratedOptions on each cluster's data so the UI count is correct.
	for (const c of clusterCreates) {
		c.data.integratedOptions = allMembersByCluster.get(c.id) ?? [];
	}

	// Aggregate evaluations from member original Statements onto each cluster.
	// Only originals contribute (synthetics have zero evals at this point).
	if (!dryRun && clusterCreates.length > 0) {
		await Promise.all(
			Array.from(originalMembersByCluster.entries()).map(async ([clusterDocId, memberIds]) => {
				if (memberIds.length === 0) return;
				try {
					const evals = await fetchEvaluationsForIds(memberIds);
					const { evaluation } = computeClusterEvaluationFromRawEvals(evals);
					const target = clusterCreates.find((c) => c.id === clusterDocId);
					if (!target) return;
					target.data.evaluation = evaluation;
					target.data.consensus = evaluation.agreement;
					target.data.totalEvaluators = evaluation.numberOfEvaluators;
				} catch (error) {
					logger.warn('Cluster evaluation aggregation failed; cluster will land with consensus 0', {
						clusterDocId,
						memberCount: memberIds.length,
						error: (error as Error).message,
					});
				}
			}),
		);
	}

	if (dryRun) {
		logger.info('Dry run summary', {
			clustersToCreate: clusterCreates.length,
			optionsToUpdate: optionUpdates.length,
			syntheticsToCreate: syntheticCreates.length,
			assignedToCluster,
			uncategorized,
		});

		return {
			clustersCreated: clusterCreates.length,
			syntheticOptionsCreated,
			assignedToCluster,
			uncategorized,
		};
	}

	// ---- Live writes ----
	// Cluster Statements + synthetic options. Original options need no update —
	// their membership is captured by each cluster's `integratedOptions`.
	const ops: Array<(b: WriteBatch) => void> = [];
	for (const c of clusterCreates) {
		ops.push((b) => b.set(db.collection(Collections.statements).doc(c.id), c.data));
	}
	for (const s of syntheticCreates) {
		ops.push((b) => b.set(db.collection(Collections.statements).doc(s.id), s.data));
	}
	await commitInBatches(ops);

	logger.info(`${hadPrior ? 'Updated' : 'Created'} topic clusters for ${parentId}`, {
		parentId,
		clusterCount: clusterCreates.length,
		syntheticOptionsCreated,
		assignedToCluster,
		uncategorized,
	});

	return {
		clustersCreated: clusterCreates.length,
		syntheticOptionsCreated,
		assignedToCluster,
		uncategorized,
	};
}
