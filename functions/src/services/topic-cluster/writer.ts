import { logger } from 'firebase-functions';
import { Collections, getRandomUID, StatementType } from '@freedi/shared-types';
import type {
	Framing,
	FramingSnapshot,
	ClusterSnapshot,
	Statement,
} from '@freedi/shared-types';
import {
	computeClusterEvaluationFromRawEvals,
	fetchEvaluationsForIds,
} from '../../condensation/aggregation';

// FramingCreatorType is exported as a type from shared-types' index.ts; import the
// schema value instead (it's a picklist whose options match the const values).
const FRAMING_CREATOR_TOPIC_CLUSTER = 'topic-cluster' as const;
import { getFirestore, WriteBatch } from 'firebase-admin/firestore';
import {
	FIRESTORE_BATCH_SIZE,
	PIPELINE_ID,
	TOPIC_FRAMING_DESCRIPTION,
	TOPIC_FRAMING_DISPLAY_NAME,
	TOPIC_FRAMING_ORDER,
} from './constants';
import type { ClusterGroup, ClusterableItem, NormalizedResponse, RawResponse } from './types';

const FRAMINGS = 'framings';
const FRAMING_SNAPSHOTS = 'framingSnapshots';

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
	framingId: string | null;
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
 * Step 1 of the idempotency contract: find the existing topic-cluster Framing
 * for this parent and tear it down (cluster Statements, framingClusters refs,
 * prior synthetics).
 */
async function teardownPrior(
	parentId: string,
): Promise<{ existingFramingId: string | null; existingFraming: Framing | null }> {
	const db = getFirestore();

	// 1. Find existing topic-cluster framing.
	const existing = await db
		.collection(FRAMINGS)
		.where('parentStatementId', '==', parentId)
		.where('createdBy', '==', FRAMING_CREATOR_TOPIC_CLUSTER)
		.limit(1)
		.get();

	let existingFramingId: string | null = null;
	let existingFraming: Framing | null = null;

	if (!existing.empty) {
		existingFramingId = existing.docs[0].id;
		existingFraming = existing.docs[0].data() as Framing;
	}

	// 2. Delete prior cluster Statements.
	const ops: Array<(b: WriteBatch) => void> = [];
	if (existingFraming) {
		for (const oldClusterId of existingFraming.clusterIds) {
			ops.push((b) => b.delete(db.collection(Collections.statements).doc(oldClusterId)));
		}
	}

	// 3. Clear framingClusters[oldFramingId] from every option under the parent.
	if (existingFramingId) {
		const optionsWithOldFraming = await db
			.collection(Collections.statements)
			.where('parentId', '==', parentId)
			.get();
		for (const doc of optionsWithOldFraming.docs) {
			const data = doc.data();
			if (data.framingClusters?.[existingFramingId]) {
				ops.push((b) =>
					b.update(doc.ref, {
						[`framingClusters.${existingFramingId}`]: null,
					}),
				);
			}
		}
	}

	// 4. Delete prior synthetic options created by THIS pipeline.
	const priorSynthetics = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('derivedByPipeline', '==', PIPELINE_ID)
		.get();
	for (const doc of priorSynthetics.docs) {
		ops.push((b) => b.delete(doc.ref));
	}

	await commitInBatches(ops);

	return { existingFramingId, existingFraming };
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
 * Build a cluster Statement (isCluster=true) for a group.
 */
function buildClusterStatement(
	parent: Statement,
	framingId: string,
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
			framingId,
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
export async function upsertTopicClusterFraming(input: WriterInput): Promise<WriterOutput> {
	const { parent, allResponses, normalized, items, groups, poolAttachments, dryRun } = input;
	const db = getFirestore();
	const parentId = parent.statementId;

	// Build per-statement action plan (the response → cluster mapping).
	// For each NormalizedResponse, identify each action's groupId.
	const actionToGroup = new Map<string, string>(); // key `${statementId}_${actionIndex}` → groupId
	for (const item of items) {
		const groupForItem = groups.find((g) => g.memberIndices.includes(items.indexOf(item)));
		if (groupForItem) {
			actionToGroup.set(`${item.sourceStatementId}_${item.actionIndex}`, groupForItem.groupId);
		}
	}

	// Above is O(n*m) over items; for large n we precompute index→group instead.
	const itemIndexToGroup = new Map<number, string>();
	for (const g of groups) {
		for (const idx of g.memberIndices) itemIndexToGroup.set(idx, g.groupId);
	}
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

	// Get existing state (we still inspect even on dry-run for accurate summary).
	const teardown = dryRun
		? { existingFramingId: null, existingFraming: null }
		: await teardownPrior(parentId);

	const framingId = teardown.existingFramingId ?? getRandomUID();

	// Build cluster Statements (one per non-empty group, including uncategorized if any).
	const groupIdToClusterDocId = new Map<string, string>();
	const clusterCreates: Array<{ id: string; data: Record<string, unknown> }> = [];
	const clusterSnapshots: ClusterSnapshot[] = [];

	for (const group of groups) {
		if (group.memberIndices.length === 0) continue;
		const displayName = group.displayName ?? 'Cluster';
		const built = buildClusterStatement(parent, framingId, displayName);
		clusterCreates.push(built);
		groupIdToClusterDocId.set(group.groupId, built.id);
		clusterSnapshots.push({
			clusterId: built.id,
			clusterName: displayName,
			optionIds: [], // populated below
		});
	}

	// Walk normalized responses and decide:
	// - actionIndex 0 → write framingClusters[framingId] = clusterDocId on the ORIGINAL.
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
				// Map original Statement.
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
			// Track in snapshot.
			const snap = clusterSnapshots.find((s) => s.clusterId === clusterDocId);
			if (snap) {
				snap.optionIds.push(
					ai === 0 ? norm.statementId : syntheticCreates[syntheticCreates.length - 1].id,
				);
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
		const snap = clusterSnapshots.find((s) => s.clusterId === clusterDocId);
		if (snap) snap.optionIds.push(attachment.statementId);
	}

	// Bucket every option (original + synthetic) by the cluster it's mapped to.
	// `integratedOptions` is the source for the "Group · N" badge in the UI.
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

	// Set integratedOptions on each cluster's data so the UI count is correct
	// even on dry-run summaries. This is cheap (no Firestore reads).
	for (const c of clusterCreates) {
		c.data.integratedOptions = allMembersByCluster.get(c.id) ?? [];
	}

	// Aggregate evaluations from member original Statements onto each cluster.
	// Only originals contribute (synthetics have zero evals at this point).
	// Skipped on dryRun to avoid Firestore reads we won't use.
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
					logger.warn(
						'Cluster evaluation aggregation failed; cluster will land with consensus 0',
						{
							clusterDocId,
							memberCount: memberIds.length,
							error: (error as Error).message,
						},
					);
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
			framingId: null,
			clustersCreated: clusterCreates.length,
			syntheticOptionsCreated,
			assignedToCluster,
			uncategorized,
		};
	}

	// ---- Live writes ----
	const ops: Array<(b: WriteBatch) => void> = [];
	for (const c of clusterCreates) {
		ops.push((b) => b.set(db.collection(Collections.statements).doc(c.id), c.data));
	}
	for (const s of syntheticCreates) {
		const dataWithFraming = {
			...s.data,
			framingClusters: { [framingId]: s.clusterDocId },
		};
		ops.push((b) => b.set(db.collection(Collections.statements).doc(s.id), dataWithFraming));
	}
	for (const u of optionUpdates) {
		ops.push((b) =>
			b.update(db.collection(Collections.statements).doc(u.id), {
				[`framingClusters.${framingId}`]: u.clusterDocId,
				lastUpdate: Date.now(),
			}),
		);
	}
	await commitInBatches(ops);

	// Upsert framing doc.
	const isUpdate = teardown.existingFraming !== null;
	const framing: Framing = {
		framingId,
		parentStatementId: parentId,
		name: TOPIC_FRAMING_DISPLAY_NAME,
		description: TOPIC_FRAMING_DESCRIPTION,
		createdAt: isUpdate ? teardown.existingFraming!.createdAt : Date.now(),
		createdBy: FRAMING_CREATOR_TOPIC_CLUSTER,
		isActive: true,
		clusterIds: clusterCreates.map((c) => c.id),
		order: isUpdate ? teardown.existingFraming!.order : TOPIC_FRAMING_ORDER,
	};
	await db.collection(FRAMINGS).doc(framingId).set(framing);

	// Save snapshot.
	const snapshot: FramingSnapshot = {
		snapshotId: getRandomUID(),
		framingId,
		parentStatementId: parentId,
		clusters: clusterSnapshots,
		createdAt: Date.now(),
	};
	await db.collection(FRAMING_SNAPSHOTS).doc(snapshot.snapshotId).set(snapshot);

	logger.info(`${isUpdate ? 'Updated' : 'Created'} topic-cluster framing ${framingId}`, {
		parentId,
		clusterCount: framing.clusterIds.length,
		syntheticOptionsCreated,
		assignedToCluster,
		uncategorized,
	});

	return {
		framingId,
		clustersCreated: clusterCreates.length,
		syntheticOptionsCreated,
		assignedToCluster,
		uncategorized,
	};
}
