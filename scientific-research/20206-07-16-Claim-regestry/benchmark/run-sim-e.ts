/**
 * Condition E — corpus replay of the "pure hierarchical LLM routing + living
 * labels" engine (SIMULATED-ENGINE.md §7) on the 150-triplet pilot.
 *
 * Unlike conditions A–D (isolated triplet classification), this replays a
 * growing corpus per dataset:
 *   Phase A (seed):  all anchors stream through the engine in file order,
 *                    building clusters + synths from nothing.
 *   Phase B (probe): all matches + distractors stream through the same engine
 *                    in a seeded shuffle, attaching into the grown structure.
 *
 * Both judge steps call the PRODUCTION classifier — nothing is reimplemented.
 * (A hand-written synth prompt was tried first and measured 43% false merges vs
 * the production prompt's 2.1%: it lacked the "shared phrasing is never
 * evidence of a match" caution and the confidence threshold. Never re-roll the
 * judge prompt in this harness.)
 *
 * Engine per statement (no cosine filter — cosine only RANKS candidate lists):
 *   1. cluster step — routeToTopics() vs clusters (living label + 3 centroid
 *      exemplars each, cosine-ranked, top 20). Stance-blind topic routing;
 *      empty result → create cluster.
 *   2. synth step — classifyAgainstClaims() vs the synths inside the chosen
 *      cluster, each rendered as RAW member text (the 95% regime, never a
 *      summary). expresses ≥ 0.6 → join; opposes → new synth + counter-edge;
 *      none → new synth.
 *   3. living label — recompute centroid + top-10 exemplars; if the exemplar
 *      set changed, one LLM call regenerates the label from raw exemplars.
 *
 * Scoring per triplet (state at probe time):
 *   synthRecall            match filed into its anchor's synth
 *   clusterRecall          match filed into its anchor's cluster
 *   falseMerge             distractor filed into its anchor's synth
 *   distractorSameCluster  distractor in anchor's cluster (pro/con structure)
 *   counterEdgeToAnchor    distractor's synth holds a counter-edge to anchor's
 *   tripletCorrect         synthRecall && !falseMerge
 *
 * Resumable per dataset: a dataset whose triplet ids are all present in the
 * result file is skipped; a partially-written dataset is replayed and only
 * missing rows are appended.
 *
 * Cluster-step configurations (the judge prompt is never varied):
 *   (baseline)        create a new cluster whenever routing returns empty
 *   --create-floor c  join the nearest cluster instead, when its centroid ≥ c
 *   --merge-pass      judge redundant cluster pairs after seeding and merge
 *   --flat-fallback   on empty routing, classify against ALL synths in the
 *                     corpus before concluding "new" — production's rule
 *
 * Usage: npx tsx run-sim-e.ts [--sample results/pilot-ids.json] [--limit N]
 *        [--model gpt-4o-mini] [--create-floor 0.7] [--merge-pass]
 *        [--flat-fallback] [--tag NAME]
 */
import { readFileSync } from 'node:fs';
import { loadEnv } from './lib/env';

loadEnv();

import { callLLM, extractJson, WORKER_MODEL } from '../../../functions/src/config/openai-chat';
import {
	classifyAgainstClaims,
	orderClaimsForClassification,
	routeToTopics,
	type ClusterClaim,
} from '../../../functions/src/services/claim-registry-service';
import { loadTriplets, questionFor, type Triplet } from './lib/datasets';
import { cachedEmbedBatch } from './lib/embeddings';
import { appendJsonl, doneIds, resultsPath } from './lib/io';

const RESULT_FILE = 'sim-e.jsonl';
const SUMMARY_FILE = 'sim-e-datasets.jsonl';
const EMBED_CACHE = 'claim-embeddings-cache.jsonl';
const CLUSTER_LIST_CAP = 20;
const CLUSTER_EXEMPLARS_SHOWN = 3;
const SYNTH_MEMBERS_SHOWN = 2;
const EXEMPLAR_SET_SIZE = 10;
/**
 * The org's gpt-4o-mini bucket is 500 RPM / 200k TPM. Production's retry ladder
 * tops out around 51s, which loses to a 60s token-bucket reset, so this harness
 * wraps every call in a longer, patient ladder of its own. Run with a low
 * LLM_CONCURRENCY (2–3) to stay inside the TPM ceiling in the first place.
 */
const RATE_LIMIT_ATTEMPTS = 8;
const RATE_LIMIT_WAIT_MS = 20_000;
/** ELJ definition (§1): attach only on `expresses` at or above this confidence. */
const ATTACH_CONFIDENCE = 0.6;
/**
 * Cluster-step fixes for the fragmentation bottleneck found in the first run
 * (r = −0.82 between clusters-per-statement and pro/con co-location).
 *
 * `--create-floor c` — creation guard: when the router declines every cluster
 * but the nearest centroid is still at cosine ≥ c, join it instead of splitting.
 * Cosine guards CREATION only, never matching — its stance-blindness is
 * harmless for a topic decision and fatal for a meaning decision.
 *
 * `--merge-pass` — repair pass after seeding: cluster pairs whose centroids sit
 * at cosine ≥ MERGE_COS are judged for topic redundancy and merged. Synths are
 * never merged, only re-parented: same topic, still distinct claims.
 */
const MERGE_COS = 0.8;

interface StoredStatement {
	id: string;
	text: string;
	vector: number[];
}

interface Synth {
	id: number;
	memberIds: string[];
	/** synth ids this synth opposes (counter-edges). */
	opposes: number[];
}

interface Cluster {
	id: number;
	label: string;
	memberIds: string[];
	centroid: number[];
	/** ids of the top-10 statements nearest the centroid. */
	exemplarIds: string[];
	synths: Synth[];
	/** False once merged away — kept in the array so `id` stays a stable index. */
	active: boolean;
}

interface EngineState {
	statements: Map<string, StoredStatement>;
	clusters: Cluster[];
	calls: { cluster: number; synth: number; label: number; merge: number };
	clusterListSizes: number[];
	synthListSizes: number[];
	/** Statement id → how it was filed (the verdict only; ids are resolved live). */
	verdicts: Map<string, Verdict>;
	merges: number;
	/** Cluster creations suppressed by the creation guard. */
	guarded: number;
	/** Statements saved from a spurious new cluster by the flat fallback. */
	rescued: number;
}

type Verdict =
	| 'new-cluster'
	| 'same-meaning'
	| 'opposes'
	| 'new-synth'
	| 'guarded-join'
	| 'flat-rescue';

interface Placement {
	clusterId: number;
	synthId: number;
	verdict: Verdict;
}

export interface SimERow {
	id: string;
	dataset: string;
	condition: 'E';
	model: string;
	anchor: Placement;
	match: Placement;
	distractor: Placement;
	synthRecall: boolean;
	clusterRecall: boolean;
	falseMerge: boolean;
	distractorSameCluster: boolean;
	counterEdgeToAnchor: boolean;
	tripletCorrect: boolean;
}

const LABEL_SYSTEM = `Write a short neutral label (5–12 words) naming the topic that ALL of the following deliberation statements are about. The label names the TOPIC, not a stance — someone agreeing and someone disagreeing should both recognize it as their topic.

Respond with JSON only: {"label": "..."}`;

/** callLLM with a patient 429 ladder — a saturated TPM bucket refills over ~60s. */
async function callJudge(options: Parameters<typeof callLLM>[0]): Promise<string> {
	let lastError: unknown;
	for (let attempt = 0; attempt < RATE_LIMIT_ATTEMPTS; attempt++) {
		try {
			return await callLLM(options);
		} catch (error) {
			if ((error as { status?: number })?.status !== 429) throw error;
			lastError = error;
			await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
		}
	}
	throw lastError;
}

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}

	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function meanVector(vectors: number[][]): number[] {
	const out = new Array<number>(vectors[0].length).fill(0);
	for (const v of vectors) for (let i = 0; i < v.length; i++) out[i] += v[i];
	for (let i = 0; i < out.length; i++) out[i] /= vectors.length;

	return out;
}

/** Deterministic PRNG (mulberry32) — reproducible probe order. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;

	return () => {
		a += 0x6d2b79f5;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function seededShuffle<T>(items: T[], seed: number): T[] {
	const rand = mulberry32(seed);
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}

	return out;
}

/**
 * A cluster as a routing target: the living label is the claim line, its most
 * central statements are the evidence. Extra exemplars ride in the explanation
 * slot so the production renderer shows all three.
 */
function asTopicClaim(cluster: Cluster, state: EngineState): ClusterClaim {
	const exemplars = cluster.exemplarIds
		.slice(0, CLUSTER_EXEMPLARS_SHOWN)
		.map((id) => state.statements.get(id)!.text);

	return {
		clusterId: `cluster:${cluster.id}`,
		canonicalClaim: cluster.label,
		publicExplanation:
			exemplars.length > 1
				? `statements in this topic include: ${exemplars.slice(1).map((t) => `"${t}"`).join('; ')}`
				: '',
		claimVersion: 1,
		claimStatus: 'confirmed',
		claimUpdatedAt: 0,
		isSynth: false,
		memberCount: cluster.memberIds.length,
		exemplar: exemplars[0],
		claimLevel: 'topic',
	};
}

/**
 * A synth as a classification target. The claim text IS a raw member statement —
 * the benchmark's 95%-accuracy regime — never a generated summary (70.1%).
 */
function asSynthClaim(cluster: Cluster, synth: Synth, state: EngineState): ClusterClaim {
	const members = synth.memberIds.slice(0, SYNTH_MEMBERS_SHOWN).map((id) => state.statements.get(id)!.text);

	return {
		clusterId: `synth:${cluster.id}:${synth.id}`,
		canonicalClaim: members[0],
		publicExplanation: '',
		claimVersion: 1,
		claimStatus: 'confirmed',
		claimUpdatedAt: 0,
		isSynth: true,
		memberCount: synth.memberIds.length,
		exemplar: members[1],
		claimLevel: 'specific',
	};
}

/**
 * classifyAgainstClaims fails CLOSED on an LLM error — a rate-limited call
 * returns a "none" that is indistinguishable from an honest new-claim verdict
 * and would silently inflate synth counts. Retry until it is a real judgment.
 */
async function classifySynth(
	input: Parameters<typeof classifyAgainstClaims>[0],
): Promise<Awaited<ReturnType<typeof classifyAgainstClaims>>> {
	for (let attempt = 0; attempt < RATE_LIMIT_ATTEMPTS; attempt++) {
		const result = await classifyAgainstClaims(input);
		if (!result.failedClosed) return result;
		await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
	}
	throw new Error('classifyAgainstClaims failed closed after retries');
}

async function generateLabel(
	model: string,
	questionText: string,
	texts: string[],
	state: EngineState,
): Promise<string> {
	state.calls.label++;
	const text = await callJudge({
		model,
		system: LABEL_SYSTEM,
		user: `Question: "${questionText}"\n\nStatements:\n${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nRespond with the JSON object.`,
		temperature: 0,
		maxTokens: 100,
		jsonMode: true,
	});
	const parsed = JSON.parse(extractJson(text)) as { label?: unknown };

	return typeof parsed.label === 'string' && parsed.label.trim()
		? parsed.label.trim()
		: texts[0].slice(0, 80);
}

/** Recompute centroid + top-10 exemplars; regenerate the label when the exemplar set changed. */
async function refreshCluster(
	model: string,
	questionText: string,
	cluster: Cluster,
	state: EngineState,
): Promise<void> {
	const members = cluster.memberIds.map((id) => state.statements.get(id)!);
	cluster.centroid = meanVector(members.map((m) => m.vector));
	const ranked = members
		.map((m) => ({ id: m.id, sim: cosine(m.vector, cluster.centroid) }))
		.sort((a, b) => b.sim - a.sim)
		.slice(0, EXEMPLAR_SET_SIZE)
		.map((m) => m.id);
	const changed =
		ranked.length !== cluster.exemplarIds.length ||
		ranked.some((id, i) => cluster.exemplarIds[i] !== id);
	cluster.exemplarIds = ranked;
	if (changed && members.length >= 2) {
		cluster.label = await generateLabel(
			model,
			questionText,
			ranked.map((id) => state.statements.get(id)!.text),
			state,
		);
	}
}

async function createCluster(
	model: string,
	questionText: string,
	statement: StoredStatement,
	state: EngineState,
): Promise<Placement> {
	const cluster: Cluster = {
		id: state.clusters.length,
		label: await generateLabel(model, questionText, [statement.text], state),
		memberIds: [statement.id],
		centroid: [...statement.vector],
		exemplarIds: [statement.id],
		synths: [{ id: 0, memberIds: [statement.id], opposes: [] }],
		active: true,
	};
	state.clusters.push(cluster);
	state.verdicts.set(statement.id, 'new-cluster');

	return { clusterId: cluster.id, synthId: 0, verdict: 'new-cluster' };
}

/** Where a statement lives RIGHT NOW — resolved live so merges can't stale-date a placement. */
function locate(state: EngineState, statementId: string): { clusterId: number; synthId: number } {
	for (const cluster of state.clusters) {
		if (!cluster.active) continue;
		for (const synth of cluster.synths) {
			if (synth.memberIds.includes(statementId)) {
				return { clusterId: cluster.id, synthId: synth.id };
			}
		}
	}
	throw new Error(`statement ${statementId} not filed anywhere`);
}

function placementOf(state: EngineState, statementId: string): Placement {
	return {
		...locate(state, statementId),
		verdict: state.verdicts.get(statementId) ?? 'new-cluster',
	};
}

const MERGE_SYSTEM = `You decide whether two topic groups from the same deliberation question are really the SAME topic and should be merged into one.

Topics are broad subject areas, NOT positions — two groups arguing OPPOSITE sides of the same issue ARE the same topic and SHOULD be merged. Merge when both groups are about the same subject matter; keep them apart only when they address genuinely different subjects.

Respond with JSON only: {"merge": true | false}`;

/**
 * Repair pass (§7 failure mode 2): fold redundant clusters together. Members and
 * synths move wholesale — merging a TOPIC must never merge the CLAIMS inside it,
 * so synths are renumbered and their counter-edges remapped, never combined.
 */
async function mergePass(model: string, questionText: string, state: EngineState): Promise<void> {
	for (let i = 0; i < state.clusters.length; i++) {
		const target = state.clusters[i];
		if (!target.active) continue;
		for (let j = i + 1; j < state.clusters.length; j++) {
			const source = state.clusters[j];
			if (!source.active) continue;
			if (cosine(target.centroid, source.centroid) < MERGE_COS) continue;

			state.calls.merge++;
			const answer = await callJudge({
				model,
				system: MERGE_SYSTEM,
				user: `Question: "${questionText}"\n\nGroup A — ${target.label}\n${target.exemplarIds
					.slice(0, CLUSTER_EXEMPLARS_SHOWN)
					.map((id) => `  "${state.statements.get(id)!.text}"`)
					.join('\n')}\n\nGroup B — ${source.label}\n${source.exemplarIds
					.slice(0, CLUSTER_EXEMPLARS_SHOWN)
					.map((id) => `  "${state.statements.get(id)!.text}"`)
					.join('\n')}\n\nRespond with the JSON object.`,
				temperature: 0,
				maxTokens: 40,
				jsonMode: true,
			});
			if ((JSON.parse(extractJson(answer)) as { merge?: unknown }).merge !== true) continue;

			// Re-parent B's synths under A: new ids, counter-edges remapped.
			const idShift = Math.max(...target.synths.map((s) => s.id)) + 1;
			const remap = new Map(source.synths.map((s, k) => [s.id, idShift + k]));
			for (const synth of source.synths) {
				target.synths.push({
					id: remap.get(synth.id)!,
					memberIds: synth.memberIds,
					opposes: synth.opposes.map((o) => remap.get(o) ?? o),
				});
			}
			target.memberIds.push(...source.memberIds);
			source.active = false;
			source.memberIds = [];
			source.synths = [];
			state.merges++;
			await refreshCluster(model, questionText, target, state);
		}
	}
}

/** Route one statement through the engine, mutating state. */
async function routeStatement(
	model: string,
	questionText: string,
	statement: StoredStatement,
	state: EngineState,
	createFloor: number,
	flatFallback: boolean,
): Promise<Placement> {
	state.statements.set(statement.id, statement);
	const active = state.clusters.filter((c) => c.active);
	if (active.length === 0) {
		return createCluster(model, questionText, statement, state);
	}

	// ---- cluster step: cosine RANKS, production routeToTopics decides ----
	// routeToTopics is the stance-blind topic router ("NOT judging agreement,
	// only subject relevance") — exactly the cluster step's semantics.
	const scored = active
		.map((c) => ({ cluster: c, sim: cosine(statement.vector, c.centroid) }))
		.sort((a, b) => b.sim - a.sim);
	const ranked = scored.slice(0, CLUSTER_LIST_CAP).map((r) => r.cluster);
	state.clusterListSizes.push(ranked.length);
	state.calls.cluster++;
	const routed = await routeToTopics({
		statementText: statement.text,
		questionText,
		topics: ranked.map((c) => asTopicClaim(c, state)),
		model,
	});

	let cluster: Cluster;
	let guardedJoin = false;
	if (routed.length > 0) {
		cluster = state.clusters[Number(routed[0].clusterId.split(':')[1])];
	} else if (flatFallback) {
		// Production's rule (classifyHierarchical): a router that finds nothing has
		// FAILED, it has not discovered a new topic. Look at every synth in the
		// corpus before concluding this is new — "a gate with an ungated second
		// look cannot misfile". Creating a cluster on empty routing is precisely
		// the fragmentation mechanism that cost 20pp in the first run.
		const all = active.flatMap((c) => c.synths.map((s) => ({ cluster: c, synth: s })));
		const claims = all.map((x) => asSynthClaim(x.cluster, x.synth, state));
		const cosineAll = new Map(
			all.map((x) => [
				`synth:${x.cluster.id}:${x.synth.id}`,
				cosine(
					statement.vector,
					meanVector(x.synth.memberIds.map((id) => state.statements.get(id)!.vector)),
				),
			]),
		);
		state.calls.synth++;
		state.synthListSizes.push(claims.length);
		const flatVerdict = await classifySynth({
			statementText: statement.text,
			questionText,
			claims: orderClaimsForClassification(claims, cosineAll),
			model,
		});
		if (
			flatVerdict.relation === 'expresses' &&
			flatVerdict.matchedClusterId &&
			flatVerdict.confidence >= ATTACH_CONFIDENCE
		) {
			const [, cid, sid] = flatVerdict.matchedClusterId.split(':').map(Number);
			const home = state.clusters[cid];
			home.synths.find((s) => s.id === sid)!.memberIds.push(statement.id);
			home.memberIds.push(statement.id);
			state.verdicts.set(statement.id, 'flat-rescue');
			state.rescued++;
			await refreshCluster(model, questionText, home, state);

			return { clusterId: cid, synthId: sid, verdict: 'flat-rescue' };
		}

		return createCluster(model, questionText, statement, state);
	} else if (scored[0].sim >= createFloor) {
		// Creation guard: the router found no home, but geometry says this is the
		// same subject as an existing cluster — join rather than fragment.
		cluster = scored[0].cluster;
		guardedJoin = true;
		state.guarded++;
	} else {
		return createCluster(model, questionText, statement, state);
	}

	// ---- synth step: production classifyAgainstClaims inside the cluster ----
	// Its prompt carries the distractor defense this benchmark exists to test
	// ("shared phrasing is never evidence of a match") plus the confidence
	// threshold — a hand-written substitute measured 43% false merges.
	state.synthListSizes.push(cluster.synths.length);
	const synthClaims = cluster.synths.map((s) => asSynthClaim(cluster, s, state));
	const cosineBySynth = new Map(
		cluster.synths.map((s) => [
			`synth:${cluster.id}:${s.id}`,
			cosine(statement.vector, meanVector(s.memberIds.map((id) => state.statements.get(id)!.vector))),
		]),
	);
	state.calls.synth++;
	const verdict = await classifySynth({
		statementText: statement.text,
		questionText,
		claims: orderClaimsForClassification(synthClaims, cosineBySynth),
		model,
	});
	const synthIdOf = (clusterId: string): number => Number(clusterId.split(':')[2]);
	const matchedId =
		verdict.relation === 'expresses' &&
		verdict.matchedClusterId &&
		verdict.confidence >= ATTACH_CONFIDENCE
			? synthIdOf(verdict.matchedClusterId)
			: null;
	const opposedId =
		verdict.relation === 'opposes' && verdict.opposedClusterId
			? synthIdOf(verdict.opposedClusterId)
			: null;

	let placement: Placement;
	if (matchedId !== null) {
		cluster.synths.find((s) => s.id === matchedId)!.memberIds.push(statement.id);
		placement = { clusterId: cluster.id, synthId: matchedId, verdict: 'same-meaning' };
	} else {
		const synth: Synth = {
			id: Math.max(...cluster.synths.map((s) => s.id)) + 1,
			memberIds: [statement.id],
			opposes: opposedId !== null ? [opposedId] : [],
		};
		cluster.synths.push(synth);
		placement = {
			clusterId: cluster.id,
			synthId: synth.id,
			verdict: opposedId !== null ? 'opposes' : 'new-synth',
		};
	}
	if (guardedJoin && placement.verdict === 'new-synth') placement.verdict = 'guarded-join';
	state.verdicts.set(statement.id, placement.verdict);

	cluster.memberIds.push(statement.id);
	await refreshCluster(model, questionText, cluster, state);

	return placement;
}

interface Config {
	limit?: number;
	sample?: string;
	model: string;
	/** Join the nearest cluster instead of splitting when the router declines all and cosine ≥ this. */
	createFloor: number;
	mergePass: boolean;
	/** On empty routing, judge against ALL synths before creating a cluster (production's rule). */
	flatFallback: boolean;
	/** Result-file suffix so configurations can be compared side by side. */
	tag: string;
}

function parseArgs(): Config {
	const args = process.argv.slice(2);
	const get = (flag: string): string | undefined => {
		const i = args.indexOf(flag);

		return i >= 0 ? args[i + 1] : undefined;
	};

	return {
		limit: get('--limit') ? Number(get('--limit')) : undefined,
		sample: get('--sample'),
		model: get('--model') ?? WORKER_MODEL,
		// 1.01 = unreachable, i.e. guard off (the original condition E).
		createFloor: get('--create-floor') ? Number(get('--create-floor')) : 1.01,
		mergePass: args.includes('--merge-pass'),
		flatFallback: args.includes('--flat-fallback'),
		tag: get('--tag') ?? '',
	};
}

async function replayDataset(
	dataset: string,
	group: Triplet[],
	config: Config,
	done: Set<string>,
): Promise<void> {
	const { model } = config;
	const resultFile = config.tag ? `sim-e-${config.tag}.jsonl` : RESULT_FILE;
	const summaryFile = config.tag ? `sim-e-datasets-${config.tag}.jsonl` : SUMMARY_FILE;
	const questionText = questionFor(dataset);
	const ctx = (text: string): string => `Question: ${questionText}\nAnswer: ${text}`;
	const texts = group.flatMap((t) => [ctx(t.anchor), ctx(t.match), ctx(t.distractor)]);
	const vectors = await cachedEmbedBatch(texts, EMBED_CACHE);
	const vectorOf = new Map<string, number[]>();
	group.forEach((t, i) => {
		vectorOf.set(`${t.id}:a`, vectors[i * 3]);
		vectorOf.set(`${t.id}:m`, vectors[i * 3 + 1]);
		vectorOf.set(`${t.id}:d`, vectors[i * 3 + 2]);
	});

	const state: EngineState = {
		statements: new Map(),
		clusters: [],
		calls: { cluster: 0, synth: 0, label: 0, merge: 0 },
		clusterListSizes: [],
		synthListSizes: [],
		verdicts: new Map(),
		merges: 0,
		guarded: 0,
		rescued: 0,
	};

	// Phase A — seed with anchors, file order.
	for (const t of group) {
		await routeStatement(
			model,
			questionText,
			{ id: `${t.id}:a`, text: t.anchor, vector: vectorOf.get(`${t.id}:a`)! },
			state,
			config.createFloor,
			config.flatFallback,
		);
	}
	const activeCount = (): number => state.clusters.filter((c) => c.active).length;
	console.info(`[${dataset}] seeded ${group.length} anchors → ${activeCount()} clusters`);

	// Repair pass on the seeded structure, so probes file into a deduplicated map.
	if (config.mergePass) {
		await mergePass(model, questionText, state);
		console.info(`[${dataset}] merge pass: ${state.merges} merges → ${activeCount()} clusters`);
	}

	// Phase B — probe with matches + distractors, seeded shuffle.
	const probes = seededShuffle(
		group.flatMap((t) => [
			{ triplet: t, kind: 'm' as const, text: t.match },
			{ triplet: t, kind: 'd' as const, text: t.distractor },
		]),
		20260724,
	);
	for (const probe of probes) {
		await routeStatement(
			model,
			questionText,
			{
				id: `${probe.triplet.id}:${probe.kind}`,
				text: probe.text,
				vector: vectorOf.get(`${probe.triplet.id}:${probe.kind}`)!,
			},
			state,
			config.createFloor,
			config.flatFallback,
		);
	}

	// Score against the FINAL structure — placements are resolved live, so a
	// merge that moved a statement after it was filed cannot stale-date a result.
	for (const t of group) {
		if (done.has(t.id)) continue;
		const anchor = placementOf(state, `${t.id}:a`);
		const match = placementOf(state, `${t.id}:m`);
		const distractor = placementOf(state, `${t.id}:d`);
		const synthRecall = match.clusterId === anchor.clusterId && match.synthId === anchor.synthId;
		const falseMerge =
			distractor.clusterId === anchor.clusterId && distractor.synthId === anchor.synthId;
		const distractorSynth = state.clusters[distractor.clusterId].synths.find(
			(s) => s.id === distractor.synthId,
		)!;

		appendJsonl(resultFile, {
			id: t.id,
			dataset,
			condition: 'E',
			model,
			anchor,
			match,
			distractor,
			synthRecall,
			clusterRecall: match.clusterId === anchor.clusterId,
			falseMerge,
			distractorSameCluster: distractor.clusterId === anchor.clusterId,
			counterEdgeToAnchor:
				distractor.clusterId === anchor.clusterId &&
				distractorSynth.opposes.includes(anchor.synthId),
			tripletCorrect: synthRecall && !falseMerge,
		} satisfies SimERow);
	}

	appendJsonl(summaryFile, {
		dataset,
		model,
		statements: state.statements.size,
		clusters: activeCount(),
		synths: state.clusters.reduce((n, c) => n + c.synths.length, 0),
		calls: state.calls,
		merges: state.merges,
		guardedJoins: state.guarded,
		flatRescues: state.rescued,
		meanClusterList:
			state.clusterListSizes.reduce((a, b) => a + b, 0) / (state.clusterListSizes.length || 1),
		meanSynthList:
			state.synthListSizes.reduce((a, b) => a + b, 0) / (state.synthListSizes.length || 1),
	});
	console.info(`[${dataset}] done — calls: ${JSON.stringify(state.calls)}`);
}

async function main(): Promise<void> {
	const config = parseArgs();
	const resultFile = config.tag ? `sim-e-${config.tag}.jsonl` : RESULT_FILE;
	let triplets = loadTriplets('main');
	if (config.sample) {
		const ids = new Set(JSON.parse(readFileSync(config.sample, 'utf8')) as string[]);
		triplets = triplets.filter((t) => ids.has(t.id));
	}
	if (config.limit) triplets = triplets.slice(0, config.limit);

	const done = doneIds(resultFile);
	const byDataset = new Map<string, Triplet[]>();
	for (const t of triplets) {
		const arr = byDataset.get(t.dataset) ?? [];
		arr.push(t);
		byDataset.set(t.dataset, arr);
	}

	const pending = [...byDataset.entries()].filter(([, group]) =>
		group.some((t) => !done.has(t.id)),
	);
	console.info(
		`model=${config.model} · createFloor=${config.createFloor} · mergePass=${config.mergePass} · flatFallback=${config.flatFallback} · ${pending.length}/${byDataset.size} datasets`,
	);
	await Promise.all(
		pending.map(([dataset, group]) => replayDataset(dataset, group, config, done)),
	);
	console.info(`Done → ${resultsPath(resultFile)}`);
}

main().catch((error) => {
	console.error('run-sim-e failed:', error);
	process.exit(1);
});
