import { logger } from 'firebase-functions';
import type { Statement } from '@freedi/shared-types';
import { loadFromFile, loadParentAndChildren } from './loader';
import { splitPools } from './filter';
import { deriveTaxonomy } from './taxonomy';
import { normalizeResponses } from './normalize';
import { embedCanonicalSentences } from './embed';
import { clusterCategory } from './cluster';
import { nameClusters } from './name';
import { reattachPools } from './pools';
import { upsertTopicClusters, type WriterInput } from './writer';
import type {
	ClusterGroup,
	ClusterableItem,
	NormalizedResponse,
	RawResponse,
	RunOptions,
	RunSummary,
} from './types';

/**
 * Public entry point for the topic-cluster pipeline. Same code path runs for
 * the CLI script and the HTTP endpoint.
 */
export async function runTopicClusterPipeline(
	parentId: string,
	opts: RunOptions = {},
): Promise<RunSummary> {
	const startedAt = Date.now();
	logger.info('Topic-cluster pipeline starting', { parentId, opts });

	// Step 1: load
	const { parent, responses } = opts.fromFile
		? await loadFromFile(opts.fromFile)
		: await loadParentAndChildren(parentId);
	logger.info(`Loaded ${responses.length} responses for parent ${parent.statementId}`);

	// Step 1 (cont): pool split
	const pools = splitPools(responses);
	logger.info('Pool sizes', {
		core: pools.core.length,
		short: pools.short.length,
		noise: pools.noise.length,
	});

	if (pools.core.length === 0) {
		logger.warn('No core responses to cluster — aborting');

		return makeEmptySummary(parent, opts.dryRun ?? false, startedAt, responses.length, pools);
	}

	// Step 2: taxonomy
	const taxonomy = await deriveTaxonomy(parent, pools.core, {
		rebuildTaxonomy: opts.rebuildTaxonomy,
	});

	// Step 3: normalization
	const normalized = await normalizeResponses(parent, taxonomy, pools.core, {
		rebuildCache: opts.rebuildCache,
	});
	const totalActions = normalized.reduce((s, n) => s + n.actions.length, 0);
	logger.info(
		`Normalization produced ${totalActions} actions across ${normalized.length} responses`,
	);

	// Step 4: embed canonical sentences
	const lastUpdates = new Map<string, number>();
	for (const r of pools.core) lastUpdates.set(r.statementId, r.lastUpdate);
	await embedCanonicalSentences(normalized, lastUpdates);

	// Build flat ClusterableItem[] and bucket by category.
	const itemsByCategory = new Map<string, ClusterableItem[]>();
	const items: ClusterableItem[] = [];
	const responseLookup = new Map<string, RawResponse>();
	for (const r of pools.core) responseLookup.set(r.statementId, r);
	for (const norm of normalized) {
		for (let ai = 0; ai < norm.actions.length; ai++) {
			const action = norm.actions[ai];
			if (!action.canonicalEmbedding || action.canonicalEmbedding.length === 0) continue;
			const original = responseLookup.get(norm.statementId);
			const item: ClusterableItem = {
				sourceStatementId: norm.statementId,
				actionIndex: ai,
				canonicalSentence: action.canonicalSentence,
				categoryKey: action.categoryKey,
				embedding: action.canonicalEmbedding,
				originalText: original?.text ?? action.canonicalSentence,
			};
			items.push(item);
			const bucket = itemsByCategory.get(action.categoryKey) ?? [];
			bucket.push(item);
			itemsByCategory.set(action.categoryKey, bucket);
		}
	}

	// Step 5: cluster within each category
	const groups: ClusterGroup[] = [];
	for (const [categoryKey, bucket] of itemsByCategory) {
		// Cluster operates on item indices RELATIVE to its bucket. Translate to global.
		const localGroups = clusterCategory(categoryKey, bucket);
		for (const lg of localGroups) {
			const globalIndices = lg.memberIndices.map((localIdx) => items.indexOf(bucket[localIdx]));
			groups.push({
				...lg,
				memberIndices: globalIndices,
			});
		}
	}
	logger.info(
		`Clustering produced ${groups.length} groups across ${itemsByCategory.size} categories`,
	);

	// Step 6: name
	await nameClusters(parent.statement ?? '', items, groups);

	// Step 7 (Step 10 in plan): reattach short + noise pools
	const poolResp: NormalizedResponse[] = []; // unused — pools embed raw text directly
	void poolResp;
	const poolAttachments = await reattachPools([...pools.short, ...pools.noise], groups);

	// Step 8 (Step 7 in plan): write back
	const writerInput: WriterInput = {
		parent,
		allResponses: responses,
		normalized,
		items,
		groups,
		poolAttachments,
		dryRun: opts.dryRun ?? false,
	};
	const writeResult = await upsertTopicClusters(writerInput);

	const summary: RunSummary = {
		parentId: parent.statementId,
		dryRun: opts.dryRun ?? false,
		taxonomy: taxonomy.categories,
		totals: {
			responsesLoaded: responses.length,
			core: pools.core.length,
			short: pools.short.length,
			noise: pools.noise.length,
			actionsExtracted: totalActions,
			clustersCreated: writeResult.clustersCreated,
			assignedToCluster: writeResult.assignedToCluster,
			uncategorized: writeResult.uncategorized,
			syntheticOptionsCreated: writeResult.syntheticOptionsCreated,
		},
		durationMs: Date.now() - startedAt,
	};

	logger.info('Topic-cluster pipeline complete', summary);

	return summary;
}

function makeEmptySummary(
	parent: Statement,
	dryRun: boolean,
	startedAt: number,
	responsesLoaded: number,
	pools: { core: RawResponse[]; short: RawResponse[]; noise: RawResponse[] },
): RunSummary {
	return {
		parentId: parent.statementId,
		dryRun,
		taxonomy: [],
		totals: {
			responsesLoaded,
			core: pools.core.length,
			short: pools.short.length,
			noise: pools.noise.length,
			actionsExtracted: 0,
			clustersCreated: 0,
			assignedToCluster: 0,
			uncategorized: 0,
			syntheticOptionsCreated: 0,
		},
		durationMs: Date.now() - startedAt,
	};
}
