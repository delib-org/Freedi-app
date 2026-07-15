import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement, StatementType, getRandomUID } from '@freedi/shared-types';
import {
	generateSynthesizedProposal,
	generateTopicLabel,
} from '../../services/integration-ai-service';
import { claimFieldsForSpawn, generateClaim } from '../../services/claim-registry-service';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { enqueueClusterRecompute } from '../liveSynth/clusterRecompute';
import { checkAndUpdateSpawnDebounce, markSpawnedNow } from './debounce';

function db() {
	return getFirestore();
}

export function isCluster(statement: Statement): boolean {
	return Array.isArray(statement.integratedOptions) && statement.integratedOptions.length > 0;
}

/**
 * A synth is a cluster that merges near-duplicate proposals into a single
 * unified proposal. Title regenerates as members grow.
 *
 * Uses the canonical `derivedByPipeline` field from the Statement type.
 * The legacy `isSynthesis` field is still written for back-compat but
 * should not be read.
 */
export function isSynth(statement: Statement): boolean {
	return isCluster(statement) && statement.derivedByPipeline === 'synthesis';
}

/**
 * A topic-cluster is a cluster that groups distinct-but-related proposals
 * under a topic label. Title is stable; doesn't regenerate on attach.
 *
 * Note: `derivedByPipeline` may be undefined on pre-migration clusters.
 * We treat any cluster that isn't explicitly a synth as a topic-cluster,
 * so old clusters keep working.
 */
export function isTopicCluster(statement: Statement): boolean {
	return isCluster(statement) && statement.derivedByPipeline !== 'synthesis';
}

interface AttachInput {
	cluster: Statement;
	option: Statement;
	similarity: number;
	triggerSource: string;
}

interface AttachResult {
	attached: boolean;
	previousMemberCount: number;
	newMemberCount: number;
}

/**
 * Append `option` to `cluster.integratedOptions`. Idempotent — if the option
 * is already a member, returns `attached: false` and does nothing.
 */
export async function attachOptionToCluster(input: AttachInput): Promise<AttachResult> {
	const { cluster, option, similarity, triggerSource } = input;
	const clusterRef = db().collection(Collections.statements).doc(cluster.statementId);
	const previousMembers = cluster.integratedOptions ?? [];
	if (previousMembers.includes(option.statementId)) {
		return {
			attached: false,
			previousMemberCount: previousMembers.length,
			newMemberCount: previousMembers.length,
		};
	}
	const newMembers = [...previousMembers, option.statementId];

	try {
		await clusterRef.update({
			integratedOptions: newMembers,
			lastUpdate: Date.now(),
		});
	} catch (error) {
		logger.warn('synthesis.pipeline.attach: cluster update failed', {
			clusterId: cluster.statementId,
			optionId: option.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return {
			attached: false,
			previousMemberCount: previousMembers.length,
			newMemberCount: previousMembers.length,
		};
	}

	logger.info('synthesis.pipeline.attach', {
		clusterId: cluster.statementId,
		optionId: option.statementId,
		similarity: Number(similarity.toFixed(3)),
		previousMemberCount: previousMembers.length,
		newMemberCount: newMembers.length,
		triggerSource,
	});

	await recordLiveSynthEvent({
		action: 'attach',
		clusterId: cluster.statementId,
		optionId: option.statementId,
		reason: `cosine=${similarity.toFixed(3)}`,
		prevState: { integratedOptions: previousMembers },
		newState: { integratedOptions: newMembers },
		triggerSource,
		parentStatementId: option.parentId,
	});

	await enqueueClusterRecompute(cluster.statementId, `${triggerSource}:attach`, option.creatorId);

	return {
		attached: true,
		previousMemberCount: previousMembers.length,
		newMemberCount: newMembers.length,
	};
}

interface SpawnInput {
	option: Statement;
	sibling: Statement;
	similarity: number;
	parentStatement: Statement;
	triggerSource: string;
	/** When true, bypass the per-parent spawn debounce. Admin paths set this. */
	bypassDebounce?: boolean;
	/**
	 * - 'synth'  → near-duplicates band (cosine ≥ attachThreshold). Calls
	 *   generateSynthesizedProposal for a unified proposal. Cluster gets
	 *   `isSynthesis: true` + `derivedByPipeline: 'synthesis'`.
	 * - 'cluster' → topic band (clusterThreshold ≤ cosine < attachThreshold).
	 *   Calls generateTopicLabel for a short theme name. Cluster gets
	 *   `isSynthesis: false` + `derivedByPipeline: 'topic-cluster'`.
	 *
	 * Defaults to 'synth' for back-compat.
	 */
	mode?: 'synth' | 'cluster';
	/**
	 * Claim-registry questions stamp canonicalClaim/publicExplanation on the
	 * new cluster (claim = the generated title, explanation = the generated
	 * description — no extra LLM call). See docs/architecture/CLAIM_REGISTRY.md.
	 */
	stampClaim?: boolean;
}

interface SpawnResult {
	spawned: boolean;
	clusterId?: string;
	cannotSynthesize?: boolean;
	debounced?: boolean;
}

/**
 * Whether a visible cluster under the same parent already contains either
 * member of the pair. Uses single-field `array-contains` queries (auto-indexed)
 * and filters parent + visibility in memory, so no composite index is needed.
 */
async function pairAlreadyClustered(option: Statement, sibling: Statement): Promise<boolean> {
	for (const memberId of [sibling.statementId, option.statementId]) {
		const snap = await db()
			.collection(Collections.statements)
			.where('integratedOptions', 'array-contains', memberId)
			.get();
		const hit = snap.docs
			.map((d) => d.data() as Statement)
			.some((c) => c.isCluster === true && c.hide !== true && c.parentId === option.parentId);
		if (hit) return true;
	}

	return false;
}

/**
 * Generate a merged proposal (or topic label) from `option + sibling` and
 * write a new cluster statement. For synth mode this emits one Gemini call
 * (`generateSynthesizedProposal`); if the LLM refuses (`cannotSynthesize`),
 * the caller should fall through to the review queue. For cluster mode this
 * emits one short Gemini call (`generateTopicLabel`) and never refuses.
 */
export async function spawnClusterFromPair(input: SpawnInput): Promise<SpawnResult> {
	const {
		option,
		sibling,
		similarity,
		parentStatement,
		triggerSource,
		bypassDebounce,
		mode = 'synth',
		stampClaim = false,
	} = input;

	if (!bypassDebounce) {
		const allowed = await checkAndUpdateSpawnDebounce(option.parentId);
		if (!allowed) {
			logger.info('synthesis.pipeline.spawn: debounced', {
				parentId: option.parentId,
				optionId: option.statementId,
				siblingId: sibling.statementId,
				mode,
			});

			return { spawned: false, debounced: true };
		}
	}

	// Dedup guard: if a visible cluster already contains either member, a
	// concurrent spawn or a prior run already covered this pair — don't create a
	// duplicate synth (the failure that produced duplicate synths in production).
	// Single-field `array-contains` query (auto-indexed); parent filtered in memory.
	if (await pairAlreadyClustered(option, sibling)) {
		logger.info('synthesis.pipeline.spawn: deduped — member already in a visible cluster', {
			parentId: option.parentId,
			optionId: option.statementId,
			siblingId: sibling.statementId,
			mode,
		});

		return { spawned: false };
	}

	const questionContext = parentStatement.statement || parentStatement.statementId;

	let title: string;
	let description: string;

	if (mode === 'synth') {
		let proposal: Awaited<ReturnType<typeof generateSynthesizedProposal>>;
		try {
			proposal = await generateSynthesizedProposal(
				[option, sibling].map((s) => ({
					statementId: s.statementId,
					statement: s.statement,
					paragraphsText: '',
					numberOfEvaluators: s.evaluation?.numberOfEvaluators ?? 0,
					consensus: s.consensus ?? 0,
					sumEvaluations: s.evaluation?.sumEvaluations ?? 0,
				})),
				questionContext,
			);
		} catch (error) {
			logger.warn('synthesis.pipeline.spawn: proposal generation failed; aborting', {
				optionId: option.statementId,
				siblingId: sibling.statementId,
				error: error instanceof Error ? error.message : String(error),
			});

			return { spawned: false };
		}

		if (proposal.cannotSynthesize === true) {
			return { spawned: false, cannotSynthesize: true };
		}
		title = proposal.title;
		description = proposal.description ?? '';
	} else {
		try {
			const label = await generateTopicLabel([option, sibling], questionContext);
			title = label.title;
			description = label.description;
		} catch (error) {
			logger.warn('synthesis.pipeline.spawn: topic label generation failed; aborting', {
				optionId: option.statementId,
				siblingId: sibling.statementId,
				error: error instanceof Error ? error.message : String(error),
			});

			return { spawned: false };
		}
	}

	const clusterId = getRandomUID();
	const now = Date.now();
	// Both synths and topic clusters are written as `statementType: option`
	// so they show up in the options-list views alongside regular suggestions.
	// The `isCluster: true` + `isSynthesis: <bool>` flag pair discriminates:
	// `isSynthesis: true`  → near-duplicate proposals merged into one
	// `isSynthesis: false` → distinct-but-related ideas grouped by topic
	const isSynthMode = mode === 'synth';
	const newCluster: Partial<Statement> & Record<string, unknown> = {
		statementId: clusterId,
		statement: title,
		description,
		statementType: StatementType.option,
		parentId: option.parentId,
		// Full ancestor chain so this cluster is picked up by descendant
		// queries/selectors that filter on parents[] (e.g. the cluster map).
		// Without it the map drops auto-generated clusters and shows flat mode.
		parents: [...(parentStatement.parents ?? []), parentStatement.statementId],
		topParentId: option.topParentId ?? option.parentId,
		creatorId: option.creatorId,
		creator: option.creator,
		createdAt: now,
		lastUpdate: now,
		consensus: 0,
		integratedOptions: [option.statementId, sibling.statementId],
		isCluster: true,
		isSynthesis: isSynthMode,
		derivedByPipeline: isSynthMode ? 'synthesis' : 'topic-cluster',
		synthesisMechanism: 'live-spawn',
		liveSynthOrigin: 'spawn',
		hide: false,
		// Synth-only: track how many members were in the set when the
		// title was last (re-)generated, so the debounced regenerator can
		// short-circuit when nothing has changed. Initialized to 2 because
		// spawn always starts with the option+sibling pair.
		...(isSynthMode ? { lastTitleRegeneratedMembers: 2, lastTitleRegeneratedAt: now } : {}),
		// Claim-registry questions: the generated title IS the canonical claim
		// (short unified proposal / theme label), the description the public
		// explanation — no extra LLM call at spawn.
		...(stampClaim ? { ...claimFieldsForSpawn(title, description) } : {}),
	};

	try {
		await db().collection(Collections.statements).doc(clusterId).set(newCluster);
	} catch (error) {
		logger.warn('synthesis.pipeline.spawn: cluster write failed', {
			clusterId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { spawned: false };
	}

	if (!bypassDebounce) {
		await markSpawnedNow(option.parentId);
	}

	logger.info('synthesis.pipeline.spawn', {
		clusterId,
		optionId: option.statementId,
		siblingId: sibling.statementId,
		similarity: Number(similarity.toFixed(3)),
		title: title?.substring(0, 80),
		mode,
		triggerSource,
	});

	await recordLiveSynthEvent({
		action: 'spawn',
		clusterId,
		optionId: option.statementId,
		reason: `spawn ${mode} at cosine=${similarity.toFixed(3)}`,
		prevState: { sourceOptionId: option.statementId, siblingId: sibling.statementId },
		newState: {
			clusterId,
			integratedOptions: [option.statementId, sibling.statementId],
			mode,
		},
		triggerSource,
		parentStatementId: option.parentId,
	});

	await enqueueClusterRecompute(clusterId, `${triggerSource}:spawn`, option.creatorId);

	// Mark this parent for the periodic bulk-flush sweep. The live pipeline
	// handles attaches and the first few spawns reactively; the scheduled
	// `fn_synthesisBulkFlush` re-truths cluster structure with UMAP+DBSCAN
	// over the full parent corpus once activity settles (~30s quiet window),
	// which catches members that live-synth left fragmented.
	try {
		await db().collection('_synthBulkRequests').doc(option.parentId).set(
			{
				parentId: option.parentId,
				lastSpawnAt: Date.now(),
				lastSpawnClusterId: clusterId,
			},
			{ merge: true },
		);
	} catch (error) {
		logger.warn('synthesis.pipeline.spawn: bulk-request marker write failed (non-fatal)', {
			parentId: option.parentId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return { spawned: true, clusterId };
}

interface SingletonSpawnInput {
	option: Statement;
	parentStatement: Statement;
	triggerSource: string;
}

/**
 * Claim-registry live-from-start behavior: a true singleton (no cosine
 * candidates, no registry match) still gets a single-member provisional claim
 * cluster, so the public sees every idea labeled in simple terms from
 * statement #1. New arrivals then attach to it via the registry pass (or
 * cosine, once geometry fills in). One WORKER_MODEL call for the claim +
 * public explanation.
 *
 * Not debounced: claim-per-statement is intentional on registry questions.
 * Deduped by the caller (pipeline's already-member guard).
 */
export async function spawnSingletonClaimCluster(input: SingletonSpawnInput): Promise<SpawnResult> {
	const { option, parentStatement, triggerSource } = input;

	const generated = await generateClaim({
		questionText: parentStatement.statement || parentStatement.statementId,
		texts: [option.statement ?? ''],
	});
	if (!generated.canonicalClaim) {
		return { spawned: false };
	}

	const clusterId = getRandomUID();
	const now = Date.now();
	const newCluster: Partial<Statement> & Record<string, unknown> = {
		statementId: clusterId,
		statement: generated.canonicalClaim,
		description: generated.publicExplanation,
		statementType: StatementType.option,
		parentId: option.parentId,
		parents: [...(parentStatement.parents ?? []), parentStatement.statementId],
		topParentId: option.topParentId ?? option.parentId,
		creatorId: option.creatorId,
		creator: option.creator,
		createdAt: now,
		lastUpdate: now,
		consensus: 0,
		integratedOptions: [option.statementId],
		isCluster: true,
		isSynthesis: false,
		derivedByPipeline: 'topic-cluster',
		synthesisMechanism: 'live-spawn',
		liveSynthOrigin: 'spawn',
		hide: false,
		...claimFieldsForSpawn(generated.canonicalClaim, generated.publicExplanation),
	};

	try {
		await db().collection(Collections.statements).doc(clusterId).set(newCluster);
	} catch (error) {
		logger.warn('synthesis.pipeline.singletonClaim: cluster write failed', {
			clusterId,
			optionId: option.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return { spawned: false };
	}

	logger.info('synthesis.pipeline.singletonClaim.spawn', {
		clusterId,
		optionId: option.statementId,
		claim: generated.canonicalClaim.substring(0, 80),
		triggerSource,
	});

	await recordLiveSynthEvent({
		action: 'spawn',
		clusterId,
		optionId: option.statementId,
		reason: 'singleton provisional claim (claim registry)',
		prevState: { sourceOptionId: option.statementId },
		newState: { clusterId, integratedOptions: [option.statementId], mode: 'singleton-claim' },
		triggerSource,
		parentStatementId: option.parentId,
	});

	await enqueueClusterRecompute(clusterId, `${triggerSource}:singleton-claim`, option.creatorId);

	return { spawned: true, clusterId };
}

interface ReviewInput {
	option: Statement;
	sibling: Statement;
	similarity: number;
	reason: string;
	triggerSource: string;
}

const REVIEW_COLLECTION = '_liveSynthCandidates';

/**
 * Log a candidate pair to the admin review queue. Used for the gray band
 * (cosine in [reviewLowerBound, attachThreshold)) where we want a human
 * to confirm before merging.
 */
export async function queueForReview(input: ReviewInput): Promise<void> {
	const { option, sibling, similarity, reason, triggerSource } = input;
	try {
		await db().collection(REVIEW_COLLECTION).add({
			optionId: option.statementId,
			siblingId: sibling.statementId,
			parentId: option.parentId,
			similarity,
			reason,
			createdAt: Date.now(),
		});
	} catch (error) {
		logger.warn('synthesis.pipeline.review: write failed', {
			optionId: option.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return;
	}

	await recordLiveSynthEvent({
		action: 'review-queued',
		clusterId: '',
		optionId: option.statementId,
		reason: `${reason} (cosine=${similarity.toFixed(3)})`,
		newState: { siblingId: sibling.statementId, similarity },
		triggerSource,
		parentStatementId: option.parentId,
	});
}
