/**
 * Clean bulk rebuild of synthesis clusters (emulator only).
 *
 * Runs the real bulk path (bulkClusterByEmbedding = in-memory UMAP -> DBSCAN)
 * over the question's raw options, producing DISJOINT clusters (each option in
 * exactly one cluster). Then, per cluster, asks the LLM for a synthesized
 * proposal (synth) or falls back to a topic label (topic-cluster), and — with
 * --execute — writes the cluster docs. Optionally links synths under 2 coarse
 * topic-clusters for 3-level nesting.
 *
 * --two-tier (PRODUCTION-FAITHFUL): after clustering, run the exact production
 * Phase-4 judge `twoTierJudge` (medoid cosine bands + LLM semantic-equivalence,
 * with complete-linkage `refineComponent` on dissent) to refine the raw cosine
 * clusters into verified synth groups — the same call `synthesizeIdeasExecute`
 * makes. Use this to validate the real mechanism in dev: cosine-only clustering
 * over-merges near-duplicate synths; the judge splits them. Without this flag
 * the script is cosine-only (diagnostic; over-merges by construction).
 *
 * PREVIEW (default): clusters + prints purity vs ground-truth + proposed
 * titles. No writes.
 * EXECUTE (--execute): deletes existing derived clusters, then creates the
 * disjoint cluster docs.
 *
 * USAGE (from functions/):
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/bulkRebuild.ts <questionId> [--eps=1.0] [--topic-threshold=0.45] \
 *       [--two-tier] [--max-llm-calls=N] [--auto-reject-band=0.82] [--auto-accept-band=0.94] \
 *       [--execute] [--hide-members] [--ground-truth=../scripts/seedSynthBenchmark.data.json]
 *
 * The judge knobs only apply with --two-tier. `--max-llm-calls` lifts the
 * production cost cap (`min(2000, ⌈N×0.2⌉)`) that starves a small corpus; the
 * band overrides probe the cosine gate (members below the reject band are
 * dropped without an LLM call — too aggressive for low within-synth cosine).
 */
import { readFileSync } from 'node:fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set. Emulator-only.');
	process.exit(1);
}
const args = process.argv.slice(2);
const questionId = args.find((a) => !a.startsWith('--'));
const getArg = (k: string, d?: string) => {
	const m = args.find((a) => a.startsWith(`--${k}=`));

	return m ? m.split('=')[1] : d;
};
const EXECUTE = args.includes('--execute');
const HIDE_MEMBERS = args.includes('--hide-members');
const TWO_TIER = args.includes('--two-tier');
const EPS = Number(getArg('eps', '1.0'));
const TOPIC_THRESHOLD = Number(getArg('topic-threshold', '0.45'));
const GROUND_TRUTH = getArg('ground-truth');
// Override the two-tier judge's LLM-call budget. Production scales it with the
// working-set size (`min(2000, ⌈N×0.2⌉)`), which starves a small validation
// corpus (N=60 ⇒ 12 calls). Pass a generous value to validate the mechanism
// itself rather than the cost cap. Empty ⇒ the production formula.
const MAX_LLM_CALLS = getArg('max-llm-calls');
// Override the two-tier judge cosine bands (production defaults: accept 0.94,
// reject 0.82). Members with cosine-to-medoid below the reject band are
// discarded WITHOUT an LLM call; on a corpus whose within-synth cosine is low
// this silently drops valid members, so exposing the bands lets validation
// probe whether the gate (not the LLM) is the failure.
const AUTO_ACCEPT_BAND = getArg('auto-accept-band');
const AUTO_REJECT_BAND = getArg('auto-reject-band');
if (!questionId) {
	console.error('Usage: npx tsx scripts/bulkRebuild.ts <questionId> [--eps=N] [--execute] ...');
	process.exit(1);
}
if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}

function extractEmbedding(raw: unknown): number[] | null {
	if (!raw) return null;
	if (Array.isArray(raw)) return raw as number[];
	if (typeof raw === 'object' && raw !== null && 'toArray' in raw) {
		try {
			return (raw as { toArray: () => number[] }).toArray();
		} catch {
			return null;
		}
	}

	return null;
}

interface RawOpt {
	id: string;
	text: string;
	embedding: number[];
}

async function main(questionId: string): Promise<void> {
	const { bulkClusterByEmbedding } = await import('../src/synthesis/bulkCluster');
	const { generateSynthesizedProposal, generateTopicLabel } = await import(
		'../src/services/integration-ai-service'
	);
	const { getRandomUID } = await import('@freedi/shared-types');
	const db = getFirestore();

	// Ground-truth label map (optional) for purity reporting.
	const textToLabel = new Map<string, string>();
	if (GROUND_TRUTH) {
		const bm = JSON.parse(readFileSync(GROUND_TRUTH, 'utf-8'));
		for (const t of bm.topics)
			for (const s of t.synths)
				for (const p of s.paraphrases) {
					textToLabel.set(p.trim(), `${t.name}/${s.name}`);
				}
	}

	const snap = await db
		.collection('statements')
		.where('parentId', '==', questionId)
		.where('statementType', '==', 'option')
		.get();
	const raw: RawOpt[] = [];
	const existingDerived: string[] = [];
	for (const d of snap.docs) {
		const x = d.data();
		if (x.derivedByPipeline) {
			existingDerived.push(x.statementId);

			continue;
		}
		const e = extractEmbedding(x.embedding);
		if (e) raw.push({ id: x.statementId, text: x.statement ?? '', embedding: e });
	}
	console.info(
		`Raw options with embeddings: ${raw.length} | existing derived clusters: ${existingDerived.length}`,
	);
	if (raw.length < 4) {
		console.error('Not enough embedded raw options.');

		return;
	}

	// ---- fine clustering → synth-level groups ----
	const fine = bulkClusterByEmbedding(
		raw.map((r) => ({ id: r.id, embedding: r.embedding })),
		{ dbscanEps: EPS, seed: 42 },
	);
	const byId = new Map(raw.map((r) => [r.id, r]));
	console.info(
		`\n[fine eps=${EPS}] clusters=${fine.clusters.length} noise=${fine.noiseIds.length} (minPts=${fine.stats.dbscanMinSamples})`,
	);
	fine.clusters.forEach((c, i) => {
		const dist: Record<string, number> = {};
		c.memberIds.forEach((id) => {
			const lbl = textToLabel.get((byId.get(id)?.text ?? '').trim()) ?? '?';
			dist[lbl] = (dist[lbl] ?? 0) + 1;
		});
		console.info(`  cluster ${i}: ${c.memberIds.length} members | purity: ${JSON.stringify(dist)}`);
	});
	if (fine.noiseIds.length) {
		console.info(
			`  NOISE (${fine.noiseIds.length}): ${fine.noiseIds.map((id) => textToLabel.get((byId.get(id)?.text ?? '').trim()) ?? '?').join(', ')}`,
		);
	}

	// ---- topic-level grouping: agglomerate the fine-cluster CENTROIDS ----
	// Single-linkage: repeatedly merge the two closest synth-groups (by max
	// cross-centroid cosine) while that best cosine >= TOPIC_THRESHOLD. Groups
	// same-theme synths (friends+clubs, exercise+eating) into topics without
	// the UMAP-geometry problem that prevents coarse DBSCAN from merging them.
	const cosine = (a: number[], b: number[]) => {
		let d = 0,
			na = 0,
			nb = 0;
		for (let i = 0; i < a.length; i++) {
			d += a[i] * b[i];
			na += a[i] * a[i];
			nb += b[i] * b[i];
		}

		return na && nb ? d / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
	};
	let fineClusters = fine.clusters.filter((c) => c.memberIds.length >= 2);

	// --two-tier: refine the raw cosine clusters with the PRODUCTION Phase-4
	// judge (the same `twoTierJudge` call `synthesizeIdeasExecute` makes), so
	// dev validates the real mechanism. Cosine-only clustering over-merges
	// near-duplicate synths; the medoid + LLM-equivalence judge (with
	// complete-linkage refinement of dissent) splits them back apart.
	if (TWO_TIER) {
		const { twoTierJudge } = await import('../src/synthesis/twoTierJudge');
		const { meanVector } = await import('../src/synthesis/bulkCluster');
		const members = new Map(
			raw.map((r) => [r.id, { id: r.id, text: r.text, embedding: r.embedding }]),
		);
		const candidates = fineClusters.map((c, i) => ({
			clusterId: `bulk-${i}`,
			memberIds: c.memberIds,
		}));
		const judge = await twoTierJudge(candidates, members, {
			maxLlmCalls: MAX_LLM_CALLS
				? Number(MAX_LLM_CALLS)
				: Math.min(2000, Math.ceil(raw.length * 0.2)),
			...(AUTO_ACCEPT_BAND ? { autoAcceptBand: Number(AUTO_ACCEPT_BAND) } : {}),
			...(AUTO_REJECT_BAND ? { autoRejectBand: Number(AUTO_REJECT_BAND) } : {}),
		});
		const verified = [...judge.verifiedClusters, ...judge.refinedFromDissent];
		fineClusters = verified.map((v) => ({
			memberIds: v.memberIds,
			centroid: meanVector(v.memberIds.map((id) => byId.get(id)!.embedding)),
		}));
		console.info(
			`\n[two-tier judge] ${candidates.length} candidate clusters → ${fineClusters.length} verified synths ` +
				`(llmCalls=${judge.stats.llmCallsMade}${judge.stats.llmCallsCapped ? ' CAPPED' : ''}, ` +
				`dropped=${judge.droppedClusters.length}, refinedFromDissent=${judge.refinedFromDissent.length})`,
		);
		fineClusters.forEach((c, i) => {
			const dist: Record<string, number> = {};
			c.memberIds.forEach((id) => {
				const lbl = textToLabel.get((byId.get(id)?.text ?? '').trim()) ?? '?';
				dist[lbl] = (dist[lbl] ?? 0) + 1;
			});
			console.info(`  synth ${i}: ${c.memberIds.length} members | purity: ${JSON.stringify(dist)}`);
		});
	}

	interface TGroup {
		centroids: number[][];
		clusterIdxs: number[];
	}
	let groups: TGroup[] = fineClusters.map((c, i) => ({
		centroids: [c.centroid],
		clusterIdxs: [i],
	}));
	const groupSim = (g1: TGroup, g2: TGroup) => {
		let best = -1;
		for (const a of g1.centroids) for (const b of g2.centroids) best = Math.max(best, cosine(a, b));

		return best;
	};
	while (groups.length > 2) {
		let bi = -1,
			bj = -1,
			bs = -Infinity;
		for (let i = 0; i < groups.length; i++)
			for (let j = i + 1; j < groups.length; j++) {
				const s = groupSim(groups[i], groups[j]);
				if (s > bs) {
					bs = s;
					bi = i;
					bj = j;
				}
			}
		if (bs < TOPIC_THRESHOLD) break;
		groups[bi] = {
			centroids: [...groups[bi].centroids, ...groups[bj].centroids],
			clusterIdxs: [...groups[bi].clusterIdxs, ...groups[bj].clusterIdxs],
		};
		groups.splice(bj, 1);
	}
	const labelOfFine = (idx: number) => {
		const dist: Record<string, number> = {};
		fineClusters[idx].memberIds.forEach((id) => {
			const l = textToLabel.get((byId.get(id)?.text ?? '').trim()) ?? '?';
			dist[l] = (dist[l] ?? 0) + 1;
		});

		return Object.keys(dist)[0];
	};
	console.info(`\n[topic grouping] threshold=${TOPIC_THRESHOLD} → ${groups.length} topics:`);
	groups.forEach((g, i) =>
		console.info(`  topic ${i}: synths = ${g.clusterIdxs.map(labelOfFine).join(', ')}`),
	);

	if (!EXECUTE) {
		console.info('\n(preview only — pass --execute to write cluster docs)');

		return;
	}

	// ===== EXECUTE =====
	const questionSnap = await db.collection('statements').doc(questionId).get();
	const question = questionSnap.data();
	const qContext = question?.statement ?? questionId;
	const creatorId = question?.creatorId ?? 'dDKeLPe8IC6EOttQ5Ih6Y9ZXcXfY';
	const creator = question?.creator ?? null;

	// Delete pre-existing derived clusters so we rebuild cleanly.
	for (const id of existingDerived) {
		await db.collection('statements').doc(id).delete();
	}
	if (existingDerived.length)
		console.info(`\nDeleted ${existingDerived.length} pre-existing derived clusters.`);

	// Build synth/topic-cluster docs from fine clusters.
	const memberToClusterId = new Map<string, string>(); // raw option → synth cluster id
	const synthClusterIds: string[] = [];
	const fineIdxToClusterId = new Map<number, string>(); // fineClusters index → created cluster id
	for (let ci = 0; ci < fineClusters.length; ci++) {
		const c = fineClusters[ci];
		const members = c.memberIds.map((id) => byId.get(id)!).filter(Boolean);
		let title = '';
		let description = '';
		let derivedByPipeline: 'synthesis' | 'topic-cluster' = 'synthesis';
		try {
			const proposal = await generateSynthesizedProposal(
				members.map((m) => ({
					statementId: m.id,
					statement: m.text,
					paragraphsText: '',
					numberOfEvaluators: 0,
					consensus: 0,
					sumEvaluations: 0,
				})),
				qContext,
			);
			if (proposal.cannotSynthesize === true) {
				const label = await generateTopicLabel(
					members.map((m) => ({ statementId: m.id, statement: m.text })) as never,
					qContext,
				);
				title = label.title;
				description = label.description;
				derivedByPipeline = 'topic-cluster';
			} else {
				title = proposal.title;
				description = proposal.description ?? '';
			}
		} catch {
			title = members[0].text.slice(0, 60);
			description = '';
		}
		const clusterId = getRandomUID();
		const now = Date.now();
		await db
			.collection('statements')
			.doc(clusterId)
			.set({
				statementId: clusterId,
				statement: title,
				description,
				statementType: 'option',
				parentId: questionId,
				topParentId: question?.topParentId ?? questionId,
				parents: [questionId],
				creatorId,
				creator,
				createdAt: now,
				lastUpdate: now,
				consensus: 0,
				integratedOptions: members.map((m) => m.id),
				isCluster: true,
				isSynthesis: derivedByPipeline === 'synthesis',
				derivedByPipeline,
				liveSynthOrigin: 'bulkRebuild',
				hide: false,
				evaluation: {
					sumEvaluations: 0,
					numberOfEvaluators: 0,
					sumPro: 0,
					sumCon: 0,
					numberOfProEvaluators: 0,
					numberOfConEvaluators: 0,
					sumSquaredEvaluations: 0,
					averageEvaluation: 0,
					agreement: 0,
					evaluationRandomNumber: Math.random(),
					viewed: 0,
				},
				randomSeed: Math.random(),
			});
		synthClusterIds.push(clusterId);
		fineIdxToClusterId.set(ci, clusterId);
		members.forEach((m) => memberToClusterId.set(m.id, clusterId));
		if (HIDE_MEMBERS) {
			for (const m of members) {
				await db
					.collection('statements')
					.doc(m.id)
					.update({ hide: true, integratedInto: clusterId, lastUpdate: Date.now() });
			}
		}
		console.info(`+ [${derivedByPipeline}] (${members.length}) ${title.slice(0, 55)}`);
	}

	// Build topic-clusters from the agglomerated centroid groups, linking the
	// synths in each group (3-level: topic → synths → raw options).
	let topicsCreated = 0;
	for (const g of groups) {
		const synthIds = g.clusterIdxs
			.map((idx) => fineIdxToClusterId.get(idx))
			.filter((x): x is string => !!x);
		if (synthIds.length < 2) continue; // a topic grouping <2 synths adds nothing
		// Topic label from a sample member text of each synth in the group.
		const sampleTexts = g.clusterIdxs.flatMap((idx) => {
			const firstMember = fineClusters[idx].memberIds[0];

			return firstMember ? [byId.get(firstMember)!.text] : [];
		});
		let title = 'Topic';
		let description = '';
		try {
			const label = await generateTopicLabel(
				sampleTexts.map((t, i) => ({ statementId: `s${i}`, statement: t })) as never,
				qContext,
			);
			title = label.title;
			description = label.description;
		} catch {
			/* keep default */
		}
		const topicId = getRandomUID();
		const now = Date.now();
		await db
			.collection('statements')
			.doc(topicId)
			.set({
				statementId: topicId,
				statement: title,
				description,
				statementType: 'option',
				parentId: questionId,
				topParentId: question?.topParentId ?? questionId,
				parents: [questionId],
				creatorId,
				creator,
				createdAt: now,
				lastUpdate: now,
				consensus: 0,
				integratedOptions: synthIds, // 3-level: topic → synths
				isCluster: true,
				isSynthesis: false,
				derivedByPipeline: 'topic-cluster',
				liveSynthOrigin: 'bulkRebuild',
				hide: false,
				evaluation: {
					sumEvaluations: 0,
					numberOfEvaluators: 0,
					sumPro: 0,
					sumCon: 0,
					numberOfProEvaluators: 0,
					numberOfConEvaluators: 0,
					sumSquaredEvaluations: 0,
					averageEvaluation: 0,
					agreement: 0,
					evaluationRandomNumber: Math.random(),
					viewed: 0,
				},
				randomSeed: Math.random(),
			});
		topicsCreated++;
		console.info(`+ [topic-cluster] links ${synthIds.length} synths :: ${title.slice(0, 50)}`);
	}

	console.info(
		`\nDONE. synths/clusters=${synthClusterIds.length}, topic-clusters=${topicsCreated}`,
	);
}

main(questionId)
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('bulk rebuild failed:', e);
		process.exit(1);
	});
