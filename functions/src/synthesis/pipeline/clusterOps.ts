import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement, StatementType, getRandomUID } from '@freedi/shared-types';
import { generateSynthesizedProposal } from '../../services/integration-ai-service';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { enqueueClusterRecompute } from '../liveSynth/clusterRecompute';
import { checkAndUpdateSpawnDebounce, markSpawnedNow } from './debounce';

function db() {
	return getFirestore();
}

export function isCluster(statement: Statement): boolean {
	return Array.isArray(statement.integratedOptions) && statement.integratedOptions.length > 0;
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
}

interface SpawnResult {
	spawned: boolean;
	clusterId?: string;
	cannotSynthesize?: boolean;
	debounced?: boolean;
}

/**
 * Generate a merged proposal from `option + sibling` and write a new cluster
 * statement. Emits one Gemini call (the proposal generator). If the LLM
 * refuses (cannotSynthesize), the caller should fall through to the review
 * queue so an admin sees the candidate pair without an autonomous merge.
 */
export async function spawnClusterFromPair(input: SpawnInput): Promise<SpawnResult> {
	const { option, sibling, similarity, parentStatement, triggerSource, bypassDebounce } = input;

	if (!bypassDebounce) {
		const allowed = await checkAndUpdateSpawnDebounce(option.parentId);
		if (!allowed) {
			logger.info('synthesis.pipeline.spawn: debounced', {
				parentId: option.parentId,
				optionId: option.statementId,
				siblingId: sibling.statementId,
			});

			return { spawned: false, debounced: true };
		}
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

	const clusterId = getRandomUID();
	const now = Date.now();
	const newCluster: Partial<Statement> & Record<string, unknown> = {
		statementId: clusterId,
		statement: proposal.title,
		description: proposal.description ?? '',
		statementType: StatementType.synthesis,
		parentId: option.parentId,
		topParentId: option.topParentId ?? option.parentId,
		creatorId: option.creatorId,
		creator: option.creator,
		createdAt: now,
		lastUpdate: now,
		consensus: 0,
		integratedOptions: [option.statementId, sibling.statementId],
		isCluster: true,
		derivedByPipeline: 'synthesis',
		liveSynthOrigin: 'spawn',
		hide: false,
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
		title: proposal.title?.substring(0, 80),
		triggerSource,
	});

	await recordLiveSynthEvent({
		action: 'spawn',
		clusterId,
		optionId: option.statementId,
		reason: `spawn at cosine=${similarity.toFixed(3)}`,
		prevState: { sourceOptionId: option.statementId, siblingId: sibling.statementId },
		newState: {
			clusterId,
			integratedOptions: [option.statementId, sibling.statementId],
		},
		triggerSource,
		parentStatementId: option.parentId,
	});

	await enqueueClusterRecompute(clusterId, `${triggerSource}:spawn`, option.creatorId);

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
