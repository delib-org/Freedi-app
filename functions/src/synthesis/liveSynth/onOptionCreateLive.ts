import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, Statement, StatementType, getRandomUID } from '@freedi/shared-types';
import { embeddingCache } from '../../services/embedding-cache-service';
import { embeddingService } from '../../services/embedding-service';
import { vectorSearchService } from '../../services/vector-search-service';
import { generateSynthesizedProposal } from '../../services/integration-ai-service';
import { synthesisFlags } from '../featureFlags';
import { recordLiveSynthEvent } from './auditLog';
import { enqueueClusterRecompute } from './clusterRecompute';

/**
 * Live-synth attach + spawn pipeline.
 *
 * Fires for every newly-created `option` statement when the live-synth flag
 * is ON. The user's foreground "join similar?" prompt has already had its
 * shot; this trigger handles the case where the user dismissed the prompt
 * (`optedOutOfMerge === true`) but a near-duplicate clearly exists.
 *
 * Decision tree (after embedding + nearest-neighbor search):
 *   - top hit cosine ≥ 0.92 AND target is a cluster (integratedOptions.length > 0)
 *       → ATTACH: append this option to the cluster's integratedOptions.
 *   - top hit cosine ≥ 0.92 AND target is a plain option
 *       → SPAWN: LLM-generate a synthesis text, create a new cluster
 *         statement with integratedOptions = [option, target].
 *   - top hit cosine in [0.85, 0.92)
 *       → REVIEW-QUEUED: log to `_liveSynthCandidates/`. No autonomous LLM
 *         call. Admin promotes manually.
 *   - otherwise → no-op.
 *
 * Cost guards:
 *   - Per-parent debounce. After a SPAWN, the parent's `_liveSynthDebounce/
 *     {parentId}` doc gets `lastSpawnAt = Date.now()`. New spawns under the
 *     same parent skip for 60 s. Bursts of similar new options collapse into
 *     a single cluster instead of N clusters (one per similar option).
 *   - Hard rule: only act on top hit ≥ 0.92. The gray band [0.85, 0.92) is
 *     admin-review only — the LLM proposal generator never fires there.
 *   - Skip if the option already belongs to a cluster (e.g. the foreground
 *     flow attached it before our background pass).
 *
 * Failure mode is fail-open. Every step is wrapped in try/catch; errors
 * are logged but never propagated (the option create itself must succeed
 * even if live-synth has a bad day).
 */

const SPAWN_DEBOUNCE_MS = 60_000;
const ATTACH_THRESHOLD = 0.92;
const REVIEW_LOWER_BOUND = 0.85;
const NEIGHBOR_LIMIT = 10;
const EMBEDDING_FETCH_TIMEOUT_MS = 5_000;

const DEBOUNCE_COLLECTION = '_liveSynthDebounce';
const REVIEW_COLLECTION = '_liveSynthCandidates';

function db() {
	return getFirestore();
}

function isOption(statement: Statement | undefined): statement is Statement {
	return Boolean(statement && statement.statementType === StatementType.option);
}

function isCluster(statement: Statement): boolean {
	return Array.isArray(statement.integratedOptions) && statement.integratedOptions.length > 0;
}

/**
 * Wait briefly for the embedding to land in the cache (race with the
 * upstream `generateEmbeddingForStatement` task). Falls through to
 * generating it ourselves if the wait expires.
 */
async function ensureEmbedding(statement: Statement): Promise<number[] | null> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < EMBEDDING_FETCH_TIMEOUT_MS) {
		const map = await embeddingCache.getBatchEmbeddings([statement.statementId]);
		const cached = map.get(statement.statementId);
		if (cached && cached.length > 0) return cached;
		// Brief backoff. Embedding usually shows up within ~1 s.
		await new Promise((r) => setTimeout(r, 500));
	}
	logger.info('liveSynth.onOptionCreate: embedding not in cache, generating directly', {
		statementId: statement.statementId,
	});
	try {
		const result = await embeddingService.generateEmbedding(
			statement.statement,
			statement.parentId,
		);

		return result.embedding;
	} catch (error) {
		logger.warn('liveSynth.onOptionCreate: embedding generation failed', {
			statementId: statement.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return null;
	}
}

interface DebounceState {
	lastSpawnAt?: number;
}

/**
 * Returns `false` if a spawn under this parent happened within the
 * debounce window — caller should skip spawning. Reading + writing the
 * doc is per-trigger overhead but tiny vs. an LLM proposal call.
 */
async function checkAndUpdateSpawnDebounce(parentId: string): Promise<boolean> {
	const ref = db().collection(DEBOUNCE_COLLECTION).doc(parentId);
	try {
		const snap = await ref.get();
		const state = (snap.exists ? snap.data() : {}) as DebounceState;
		if (state.lastSpawnAt && Date.now() - state.lastSpawnAt < SPAWN_DEBOUNCE_MS) {
			return false;
		}

		return true;
	} catch (error) {
		// Fail-open: if we can't read the debounce, allow the spawn rather
		// than silently dropping work. The audit log records every spawn
		// so duplicates can be reverted manually.
		logger.warn('liveSynth.debounce: read failed, allowing spawn', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});

		return true;
	}
}

async function markSpawnedNow(parentId: string): Promise<void> {
	const ref = db().collection(DEBOUNCE_COLLECTION).doc(parentId);
	try {
		await ref.set({ parentId, lastSpawnAt: Date.now() }, { merge: true });
	} catch (error) {
		logger.warn('liveSynth.debounce: write failed (non-fatal)', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

interface AttachInput {
	cluster: Statement;
	option: Statement;
	similarity: number;
}

async function attachOptionToCluster(input: AttachInput): Promise<void> {
	const { cluster, option, similarity } = input;
	const clusterRef = db().collection(Collections.statements).doc(cluster.statementId);
	const previousMembers = cluster.integratedOptions ?? [];
	const newMembers = previousMembers.includes(option.statementId)
		? previousMembers
		: [...previousMembers, option.statementId];

	if (newMembers === previousMembers) {
		// Already a member — defensive: treat as no-op.
		return;
	}

	try {
		await clusterRef.update({
			integratedOptions: newMembers,
			lastUpdate: Date.now(),
		});
	} catch (error) {
		logger.warn('liveSynth.attach: cluster update failed', {
			clusterId: cluster.statementId,
			optionId: option.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return;
	}

	logger.info('liveSynth.attach', {
		clusterId: cluster.statementId,
		optionId: option.statementId,
		similarity: Number(similarity.toFixed(3)),
		previousMemberCount: previousMembers.length,
		newMemberCount: newMembers.length,
	});

	await recordLiveSynthEvent({
		action: 'attach',
		clusterId: cluster.statementId,
		optionId: option.statementId,
		reason: `cosine=${similarity.toFixed(3)} ≥ ${ATTACH_THRESHOLD}`,
		prevState: { integratedOptions: previousMembers },
		newState: { integratedOptions: newMembers },
		triggerSource: 'fn_onOptionCreateLive',
		parentStatementId: option.parentId,
	});

	// Recompute the cluster's evaluation aggregate + polarization so the
	// new member's votes are reflected. Honors the cluster-aware
	// polarization flag; if that flag is OFF, the queue entry is drained
	// without acting.
	await enqueueClusterRecompute(cluster.statementId, 'liveSynth:attach', option.creatorId);
}

interface SpawnInput {
	option: Statement;
	sibling: Statement;
	similarity: number;
	parentStatement: Statement;
}

async function spawnClusterFromPair(input: SpawnInput): Promise<void> {
	const { option, sibling, similarity, parentStatement } = input;

	const allowed = await checkAndUpdateSpawnDebounce(option.parentId);
	if (!allowed) {
		logger.info('liveSynth.spawn: debounced', {
			parentId: option.parentId,
			optionId: option.statementId,
			siblingId: sibling.statementId,
		});

		return;
	}

	const questionContext = parentStatement.statement || parentStatement.statementId;
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
		logger.warn('liveSynth.spawn: proposal generation failed; aborting spawn', {
			optionId: option.statementId,
			siblingId: sibling.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return;
	}

	if (proposal.cannotSynthesize === true) {
		// LLM refused — spawn would conflate fundamentally different solution
		// directions. Log to review queue so admin can manually decide.
		await queueForReview({
			option,
			sibling,
			similarity,
			reason: `LLM refused synthesis: ${proposal.reason ?? 'unknown'}`,
		});

		return;
	}

	const clusterId = getRandomUID();
	const now = Date.now();
	const newCluster: Partial<Statement> & Record<string, unknown> = {
		statementId: clusterId,
		statement: proposal.title,
		description: proposal.description ?? '',
		statementType: StatementType.option,
		parentId: option.parentId,
		topParentId: option.topParentId ?? option.parentId,
		creatorId: option.creatorId,
		creator: option.creator,
		createdAt: now,
		lastUpdate: now,
		consensus: 0,
		integratedOptions: [option.statementId, sibling.statementId],
		isCluster: true,
		// `derivedByPipeline` is constrained to existing pipeline ids in the
		// shared schema. Use 'synthesis' (closest semantic match — this IS
		// the synthesis pipeline, just the live variant) and stamp the
		// live origin separately so admin tooling can distinguish.
		derivedByPipeline: 'synthesis',
		liveSynthOrigin: 'spawn',
		hide: false,
	};

	try {
		await db().collection(Collections.statements).doc(clusterId).set(newCluster);
	} catch (error) {
		logger.warn('liveSynth.spawn: cluster write failed', {
			clusterId,
			error: error instanceof Error ? error.message : String(error),
		});

		return;
	}

	await markSpawnedNow(option.parentId);

	logger.info('liveSynth.spawn', {
		clusterId,
		optionId: option.statementId,
		siblingId: sibling.statementId,
		similarity: Number(similarity.toFixed(3)),
		title: proposal.title?.substring(0, 80),
	});

	await recordLiveSynthEvent({
		action: 'spawn',
		clusterId,
		optionId: option.statementId,
		reason: `spawn from option+sibling at cosine=${similarity.toFixed(3)}`,
		prevState: { sourceOptionId: option.statementId, siblingId: sibling.statementId },
		newState: {
			clusterId,
			integratedOptions: [option.statementId, sibling.statementId],
		},
		triggerSource: 'fn_onOptionCreateLive',
		parentStatementId: option.parentId,
	});

	// Initialize the cluster's evaluation aggregate from the existing
	// votes on the two members. Reuses the same recompute path Ship 3a
	// uses for ongoing maintenance.
	await enqueueClusterRecompute(clusterId, 'liveSynth:spawn', option.creatorId);
}

interface QueueForReviewInput {
	option: Statement;
	sibling: Statement;
	similarity: number;
	reason: string;
}

async function queueForReview(input: QueueForReviewInput): Promise<void> {
	const { option, sibling, similarity, reason } = input;
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
		logger.warn('liveSynth.review-queue: write failed', {
			optionId: option.statementId,
			error: error instanceof Error ? error.message : String(error),
		});

		return;
	}

	await recordLiveSynthEvent({
		action: 'review-queued',
		clusterId: '', // no cluster created; the review queue holds the candidate pair
		optionId: option.statementId,
		reason: `${reason} (cosine=${similarity.toFixed(3)})`,
		newState: { siblingId: sibling.statementId, similarity },
		triggerSource: 'fn_onOptionCreateLive',
		parentStatementId: option.parentId,
	});
}

/**
 * Top-level handler. Called from the Firestore onCreate trigger
 * registered in `index.ts`. The function is exported so tests can
 * exercise the decision tree without spinning up the full Functions
 * emulator.
 *
 * Returns `void` — the trigger framework discards return values, and
 * any error inside the body is logged + swallowed (live-synth must
 * never block the underlying option create).
 */
export async function liveSynthOnOptionCreate(rawStatement: unknown): Promise<void> {
	if (!synthesisFlags.liveSynth) return;

	let statement: Statement;
	try {
		statement = rawStatement as Statement;
	} catch {
		return;
	}
	if (!isOption(statement)) return;
	if (!statement.parentId || statement.parentId === 'top') return;

	// Skip if the option already belongs to a cluster (e.g. the foreground
	// "join similar?" flow attached it). Reading the same query the live-
	// attach path uses keeps us consistent.
	if ((statement.integratedOptions ?? []).length > 0) return;

	// Optional explicit signal from the foreground UI. The convention:
	//   - undefined / missing: trigger runs (background safety net).
	//   - true: user explicitly dismissed the foreground prompt; trigger runs.
	//   - false: user opted into the foreground merge; foreground will
	//     handle it. We skip to avoid duplicate work.
	const optedOutOfMergeRaw = (statement as unknown as Record<string, unknown>)['optedOutOfMerge'];
	if (optedOutOfMergeRaw === false) return;

	try {
		const embedding = await ensureEmbedding(statement);
		if (!embedding) return;

		const neighbors = await vectorSearchService.findSimilarByEmbedding(
			embedding,
			statement.parentId,
			{
				limit: NEIGHBOR_LIMIT,
				threshold: REVIEW_LOWER_BOUND,
			},
		);

		// Drop self-match (the just-created option is in the same parentId
		// scope and findNearest will return it at cosine ≈ 1).
		const candidates = neighbors.filter((n) => n.statement.statementId !== statement.statementId);
		if (candidates.length === 0) {
			logger.debug('liveSynth.onOptionCreate.noNeighbors', {
				statementId: statement.statementId,
				parentId: statement.parentId,
			});

			return;
		}

		const top = candidates[0];

		if (top.similarity >= ATTACH_THRESHOLD && isCluster(top.statement)) {
			await attachOptionToCluster({
				cluster: top.statement,
				option: statement,
				similarity: top.similarity,
			});

			return;
		}

		if (top.similarity >= ATTACH_THRESHOLD) {
			// Top hit is a plain option — fetch the parent so the proposal LLM
			// has the question context, then spawn.
			const parentDoc = await db().collection(Collections.statements).doc(statement.parentId).get();
			if (!parentDoc.exists) {
				logger.warn('liveSynth.spawn: parent not found, skipping', {
					parentId: statement.parentId,
				});

				return;
			}
			const parentStatement = parentDoc.data() as Statement;
			await spawnClusterFromPair({
				option: statement,
				sibling: top.statement,
				similarity: top.similarity,
				parentStatement,
			});

			return;
		}

		// In the gray band [0.85, 0.92) — log to admin review, no LLM call.
		await queueForReview({
			option: statement,
			sibling: top.statement,
			similarity: top.similarity,
			reason: 'gray-band match (no auto-action)',
		});
	} catch (error) {
		logger.warn('liveSynth.onOptionCreate: handler failed', {
			statementId: statement.statementId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export const __INTERNAL = {
	SPAWN_DEBOUNCE_MS,
	ATTACH_THRESHOLD,
	REVIEW_LOWER_BOUND,
	DEBOUNCE_COLLECTION,
	REVIEW_COLLECTION,
};
