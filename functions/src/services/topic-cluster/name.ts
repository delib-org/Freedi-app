import { logger } from 'firebase-functions';
import pLimit from 'p-limit';
import { callLLM, WORKER_MODEL } from '../../config/openai-chat';
import { computeCTfIdf } from './cTfIdf';
import { CTFIDF_TOP_TOKENS, NAME_SAMPLES_PER_CLUSTER, NORMALIZE_CONCURRENCY } from './constants';
import { NAME_SYSTEM, nameUserPrompt } from './prompts';
import type { ClusterGroup, ClusterableItem } from './types';

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;

	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Pick up to N items closest to the cluster's centroid.
 */
function representativeMembers(
	group: ClusterGroup,
	items: ClusterableItem[],
	n: number,
): ClusterableItem[] {
	if (group.memberIndices.length <= n) {
		return group.memberIndices.map((i) => items[i]);
	}
	if (!group.centroid) {
		return group.memberIndices.slice(0, n).map((i) => items[i]);
	}
	const centroid = group.centroid;
	const scored = group.memberIndices.map((i) => ({
		item: items[i],
		sim: cosineSimilarity(items[i].embedding, centroid),
	}));
	scored.sort((a, b) => b.sim - a.sim);

	return scored.slice(0, n).map((x) => x.item);
}

/**
 * Name every cluster group via Haiku, in parallel (concurrency-limited). Also
 * computes c-TF-IDF top tokens per cluster as a sanity check (logged only).
 */
export async function nameClusters(
	question: string,
	items: ClusterableItem[],
	groups: ClusterGroup[],
): Promise<void> {
	if (groups.length === 0) return;

	// 1. c-TF-IDF on member ORIGINAL TEXT (un-normalized).
	const clusterTexts = groups.map((g) =>
		g.memberIndices.map((i) => items[i].originalText).join(' '),
	);
	const tokens = computeCTfIdf(clusterTexts, CTFIDF_TOP_TOKENS);
	for (let i = 0; i < groups.length; i++) {
		groups[i].cTfIdfTokens = tokens[i];
	}

	// 2. LLM naming. Skip "uncategorized" — it gets a fixed label downstream.
	const limiter = pLimit(NORMALIZE_CONCURRENCY);
	const tasks = groups.map((group) =>
		limiter(async () => {
			if (group.clusterIndex === -1) {
				group.displayName = 'Uncategorized';

				return;
			}
			const samples = representativeMembers(group, items, NAME_SAMPLES_PER_CLUSTER).map(
				(m) => m.canonicalSentence,
			);
			if (samples.length === 0) {
				group.displayName = 'Cluster';

				return;
			}
			try {
				const raw = await callLLM({
					model: WORKER_MODEL,
					system: NAME_SYSTEM,
					user: nameUserPrompt(question, samples),
					maxTokens: 64,
					temperature: 0,
				});
				const cleaned = raw
					.trim()
					.replace(/^["'`]+|["'`]+$/g, '')
					.replace(/^Label:\s*/i, '')
					.replace(/\s+/g, ' ')
					.trim();
				group.displayName = cleaned.length > 0 ? cleaned : `Cluster ${group.clusterIndex + 1}`;
			} catch (error) {
				logger.warn('Cluster naming failed; using fallback', {
					groupId: group.groupId,
					error: (error as Error).message,
				});
				group.displayName = `Cluster ${group.clusterIndex + 1}`;
			}
			logger.info(`Cluster named`, {
				groupId: group.groupId,
				name: group.displayName,
				size: group.memberIndices.length,
				cTfIdf: group.cTfIdfTokens,
			});
		}),
	);
	await Promise.all(tasks);
}
