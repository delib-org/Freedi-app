import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import type { Framing, Statement } from '@freedi/shared-types';
import pLimit from 'p-limit';
import { callLLM, WORKER_MODEL } from '../../config/openai-chat';

const FRAMINGS = 'framings';

/**
 * Default consensus threshold above which a member option is considered
 * "wanted" enough to be included in the cluster's summary. The user can
 * override per call. We use top-level `consensus` here (set at clustering
 * time on the option from its own evaluation aggregate); falling back to
 * `evaluation.agreement` keeps the rule resilient if either field is empty.
 */
const DEFAULT_CONSENSUS_THRESHOLD = 0.3;
const MAX_MEMBERS_PER_PROMPT = 30;
const SUMMARIZE_CONCURRENCY = 5;

const SUMMARY_SYSTEM = `You are a research assistant. You receive a cluster theme and several user-submitted suggestions that share that theme and have positive support from voters. Write a concise 2–3 sentence summary that captures what the supporters are collectively proposing or asserting.

Rules:
- Same language as the suggestions (do not translate).
- Plain prose. No bullet points, no quotes, no preface like "Summary:".
- Focus on the SHARED proposal/assertion. Mention disagreements only if material.
- 2 to 3 sentences. Stop there.`;

interface SummarizeOptions {
	threshold?: number;
	clusterIds?: string[]; // limit to specific clusters; default all in the framing
}

export interface SummarizeResult {
	parentId: string;
	framingId: string;
	clustersConsidered: number;
	clustersSummarized: number;
	clustersSkippedNoMembers: number;
	threshold: number;
	durationMs: number;
}

/**
 * Read every option of a parent question that is mapped to one of the given
 * cluster IDs via `framingClusters[framingId]`, return them indexed by
 * cluster ID. Synthetic options (created by the topic-cluster pipeline) ARE
 * included if they map; pool reattachments are too.
 */
async function loadMembersByCluster(
	parentId: string,
	framingId: string,
	clusterIds: Set<string>,
): Promise<Map<string, Statement[]>> {
	const db = getFirestore();
	const snap = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.get();
	const out = new Map<string, Statement[]>();
	for (const doc of snap.docs) {
		const s = doc.data() as Statement;
		if (s.isCluster === true) continue;
		const mapping = (s as unknown as { framingClusters?: Record<string, string | null> })
			.framingClusters;
		const target = mapping?.[framingId];
		if (!target || !clusterIds.has(target)) continue;
		const list = out.get(target) ?? [];
		list.push(s);
		out.set(target, list);
	}

	return out;
}

function memberConsensus(s: Statement): number {
	const top = (s as unknown as { consensus?: number }).consensus;
	if (typeof top === 'number') return top;
	const ev = (s as unknown as { evaluation?: { agreement?: number } }).evaluation;
	if (ev && typeof ev.agreement === 'number') return ev.agreement;

	return 0;
}

function memberText(s: Statement): string {
	return (s.statement ?? '').trim();
}

/**
 * Summarize each cluster of a Framing from its high-consensus members. Writes
 * the result to `cluster.brief` (admin-authored brief field). Idempotent —
 * rerunning overwrites prior briefs.
 */
export async function summarizeFramingClusters(
	parentId: string,
	framingId: string,
	opts: SummarizeOptions = {},
): Promise<SummarizeResult> {
	const startedAt = Date.now();
	const threshold = opts.threshold ?? DEFAULT_CONSENSUS_THRESHOLD;
	const db = getFirestore();

	// Load the framing to get its cluster ids.
	const framingDoc = await db.collection(FRAMINGS).doc(framingId).get();
	if (!framingDoc.exists) throw new Error(`Framing ${framingId} not found`);
	const framing = framingDoc.data() as Framing;
	if (framing.parentStatementId !== parentId) {
		throw new Error(
			`Framing ${framingId} belongs to parent ${framing.parentStatementId}, not ${parentId}`,
		);
	}
	const wanted = opts.clusterIds && opts.clusterIds.length > 0
		? new Set(opts.clusterIds.filter((id) => framing.clusterIds.includes(id)))
		: new Set(framing.clusterIds);
	if (wanted.size === 0) {
		return {
			parentId,
			framingId,
			clustersConsidered: 0,
			clustersSummarized: 0,
			clustersSkippedNoMembers: 0,
			threshold,
			durationMs: Date.now() - startedAt,
		};
	}

	// Read each cluster Statement to know its name (used in prompt).
	const clusterDocs = await db.getAll(
		...Array.from(wanted).map((id) => db.collection(Collections.statements).doc(id)),
	);
	const clusterById = new Map<string, Statement>();
	for (const doc of clusterDocs) {
		if (!doc.exists) continue;
		const data = doc.data() as Statement;
		clusterById.set(data.statementId, data);
	}

	const membersByCluster = await loadMembersByCluster(parentId, framingId, wanted);

	let summarized = 0;
	let skipped = 0;
	const limiter = pLimit(SUMMARIZE_CONCURRENCY);
	await Promise.all(
		Array.from(wanted).map((clusterId) =>
			limiter(async () => {
				const cluster = clusterById.get(clusterId);
				if (!cluster) {
					skipped++;
					return;
				}
				const allMembers = membersByCluster.get(clusterId) ?? [];
				const eligible = allMembers
					.filter((m) => memberConsensus(m) >= threshold)
					.filter((m) => memberText(m).length > 0)
					.sort((a, b) => memberConsensus(b) - memberConsensus(a))
					.slice(0, MAX_MEMBERS_PER_PROMPT);
				if (eligible.length === 0) {
					logger.info('Cluster has no above-threshold members; skipping summary', {
						clusterId,
						threshold,
						totalMembers: allMembers.length,
					});
					skipped++;
					return;
				}
				try {
					const userPrompt = [
						`CLUSTER THEME: ${cluster.statement ?? ''}`,
						'',
						`SUPPORTING SUGGESTIONS (consensus ≥ ${threshold}):`,
						...eligible.map((m, i) => `${i + 1}. ${memberText(m)}`),
					].join('\n');
					const raw = await callLLM({
						model: WORKER_MODEL,
						system: SUMMARY_SYSTEM,
						user: userPrompt,
						maxTokens: 320,
						temperature: 0,
					});
					const brief = raw
						.trim()
						.replace(/^["'`]+|["'`]+$/g, '')
						.replace(/^Summary:\s*/i, '')
						.trim();
					if (brief.length === 0) {
						skipped++;
						return;
					}
					await db.collection(Collections.statements).doc(clusterId).update({
						brief,
						lastUpdate: Date.now(),
					});
					summarized++;
				} catch (error) {
					logger.warn('Cluster summary failed', {
						clusterId,
						error: (error as Error).message,
					});
					skipped++;
				}
			}),
		),
	);

	const durationMs = Date.now() - startedAt;
	logger.info('Cluster summarization complete', {
		parentId,
		framingId,
		clustersConsidered: wanted.size,
		clustersSummarized: summarized,
		clustersSkippedNoMembers: skipped,
		threshold,
		durationMs,
	});

	return {
		parentId,
		framingId,
		clustersConsidered: wanted.size,
		clustersSummarized: summarized,
		clustersSkippedNoMembers: skipped,
		threshold,
		durationMs,
	};
}
