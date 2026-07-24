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
 * Engine per statement (no cosine filter — cosine only RANKS cluster lists):
 *   1. cluster step — one LLM call vs clusters (living label + 3 centroid
 *      exemplars each, ranked by centroid cosine, top 20). Topic decision,
 *      stance-blind. None → create cluster.
 *   2. synth step — one LLM call vs the synths inside the chosen cluster
 *      (2 member texts each). sameMeaning → join; opposes → new synth with a
 *      counter-edge; neither → new synth.
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
 * Usage: npx tsx run-sim-e.ts [--sample results/pilot-ids.json] [--limit N] [--model gpt-4o-mini]
 */
import { readFileSync } from 'node:fs';
import { loadEnv } from './lib/env';

loadEnv();

import { callLLM, extractJson, WORKER_MODEL } from '../../../functions/src/config/openai-chat';
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
}

interface EngineState {
	statements: Map<string, StoredStatement>;
	clusters: Cluster[];
	calls: { cluster: number; synth: number; label: number };
	clusterListSizes: number[];
	synthListSizes: number[];
}

interface Placement {
	clusterId: number;
	synthId: number;
	verdict: 'new-cluster' | 'same-meaning' | 'opposes' | 'new-synth';
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

const CLUSTER_SYSTEM = `You organize statements from a public deliberation into topic clusters. A cluster groups statements about the same specific topic or issue REGARDLESS OF STANCE — supporting and opposing statements about the same issue belong in the SAME cluster. Decide whether the new statement belongs under one of the existing clusters (same topic), or none of them.

Respond with JSON only: {"cluster": <number>} or {"cluster": null}`;

const SYNTH_SYSTEM = `A synth is a group of statements that all express the SAME claim: same meaning AND same stance, even in different words or a different language. Statements about the same issue with OPPOSITE stances are NOT the same claim.

Given the new statement and the synths in this cluster (each shown by example statements), decide:
1. "sameMeaning": which synth (if any) expresses the same claim as the new statement.
2. "opposes": if none has the same meaning, which synth (if any) takes the opposite stance on the same specific issue.

Respond with JSON only: {"sameMeaning": <number or null>, "opposes": <number or null>}`;

const LABEL_SYSTEM = `Write a short neutral label (5–12 words) naming the topic that ALL of the following deliberation statements are about. The label names the TOPIC, not a stance — someone agreeing and someone disagreeing should both recognize it as their topic.

Respond with JSON only: {"label": "..."}`;

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

function parseIndex(value: unknown, max: number): number | null {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isInteger(n) || n < 1 || n > max) return null;

	return n - 1;
}

async function generateLabel(
	model: string,
	questionText: string,
	texts: string[],
	state: EngineState,
): Promise<string> {
	state.calls.label++;
	const text = await callLLM({
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
	};
	state.clusters.push(cluster);

	return { clusterId: cluster.id, synthId: 0, verdict: 'new-cluster' };
}

/** Route one statement through the engine, mutating state. */
async function routeStatement(
	model: string,
	questionText: string,
	statement: StoredStatement,
	state: EngineState,
): Promise<Placement> {
	state.statements.set(statement.id, statement);
	if (state.clusters.length === 0) {
		return createCluster(model, questionText, statement, state);
	}

	// ---- cluster step: cosine ranks, judge decides ----
	const ranked = state.clusters
		.map((c) => ({ cluster: c, sim: cosine(statement.vector, c.centroid) }))
		.sort((a, b) => b.sim - a.sim)
		.slice(0, CLUSTER_LIST_CAP)
		.map((r) => r.cluster);
	state.clusterListSizes.push(ranked.length);
	const clusterLines = ranked
		.map((c, i) => {
			const examples = c.exemplarIds
				.slice(0, CLUSTER_EXEMPLARS_SHOWN)
				.map((id) => `"${state.statements.get(id)!.text}"`)
				.join(' | ');

			return `${i + 1}. topic: ${c.label}\n   examples: ${examples}`;
		})
		.join('\n');
	state.calls.cluster++;
	const clusterAnswer = await callLLM({
		model,
		system: CLUSTER_SYSTEM,
		user: `Question: "${questionText}"\n\nExisting clusters:\n${clusterLines}\n\nNew statement: "${statement.text}"\n\nRespond with the JSON object.`,
		temperature: 0,
		maxTokens: 60,
		jsonMode: true,
	});
	const clusterParsed = JSON.parse(extractJson(clusterAnswer)) as { cluster?: unknown };
	const clusterIndex = parseIndex(clusterParsed.cluster, ranked.length);
	if (clusterIndex === null) {
		return createCluster(model, questionText, statement, state);
	}
	const cluster = ranked[clusterIndex];

	// ---- synth step: four-way verdict inside the chosen cluster ----
	state.synthListSizes.push(cluster.synths.length);
	const synthLines = cluster.synths
		.map((s, i) => {
			const examples = s.memberIds
				.slice(0, SYNTH_MEMBERS_SHOWN)
				.map((id) => `"${state.statements.get(id)!.text}"`)
				.join(' | ');

			return `${i + 1}. ${examples}`;
		})
		.join('\n');
	state.calls.synth++;
	const synthAnswer = await callLLM({
		model,
		system: SYNTH_SYSTEM,
		user: `Question: "${questionText}"\n\nSynths in this cluster:\n${synthLines}\n\nNew statement: "${statement.text}"\n\nRespond with the JSON object.`,
		temperature: 0,
		maxTokens: 60,
		jsonMode: true,
	});
	const synthParsed = JSON.parse(extractJson(synthAnswer)) as {
		sameMeaning?: unknown;
		opposes?: unknown;
	};
	const sameIndex = parseIndex(synthParsed.sameMeaning, cluster.synths.length);
	const opposesIndex = parseIndex(synthParsed.opposes, cluster.synths.length);

	let placement: Placement;
	if (sameIndex !== null) {
		cluster.synths[sameIndex].memberIds.push(statement.id);
		placement = { clusterId: cluster.id, synthId: cluster.synths[sameIndex].id, verdict: 'same-meaning' };
	} else {
		const synth: Synth = {
			id: cluster.synths.length,
			memberIds: [statement.id],
			opposes: opposesIndex !== null ? [cluster.synths[opposesIndex].id] : [],
		};
		cluster.synths.push(synth);
		placement = {
			clusterId: cluster.id,
			synthId: synth.id,
			verdict: opposesIndex !== null ? 'opposes' : 'new-synth',
		};
	}

	cluster.memberIds.push(statement.id);
	await refreshCluster(model, questionText, cluster, state);

	return placement;
}

function parseArgs(): { limit?: number; sample?: string; model: string } {
	const args = process.argv.slice(2);
	const get = (flag: string): string | undefined => {
		const i = args.indexOf(flag);

		return i >= 0 ? args[i + 1] : undefined;
	};

	return {
		limit: get('--limit') ? Number(get('--limit')) : undefined,
		sample: get('--sample'),
		model: get('--model') ?? WORKER_MODEL,
	};
}

async function replayDataset(
	dataset: string,
	group: Triplet[],
	model: string,
	done: Set<string>,
): Promise<void> {
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
		calls: { cluster: 0, synth: 0, label: 0 },
		clusterListSizes: [],
		synthListSizes: [],
	};

	// Phase A — seed with anchors, file order.
	const anchorPlacement = new Map<string, Placement>();
	for (const t of group) {
		const placement = await routeStatement(
			model,
			questionText,
			{ id: `${t.id}:a`, text: t.anchor, vector: vectorOf.get(`${t.id}:a`)! },
			state,
		);
		anchorPlacement.set(t.id, placement);
	}
	console.info(
		`[${dataset}] seeded ${group.length} anchors → ${state.clusters.length} clusters, ${state.clusters.reduce((n, c) => n + c.synths.length, 0)} synths`,
	);

	// Phase B — probe with matches + distractors, seeded shuffle.
	const probes = seededShuffle(
		group.flatMap((t) => [
			{ triplet: t, kind: 'm' as const, text: t.match },
			{ triplet: t, kind: 'd' as const, text: t.distractor },
		]),
		20260724,
	);
	const probePlacement = new Map<string, Placement>();
	for (const probe of probes) {
		const key = `${probe.triplet.id}:${probe.kind}`;
		probePlacement.set(
			key,
			await routeStatement(
				model,
				questionText,
				{ id: key, text: probe.text, vector: vectorOf.get(key)! },
				state,
			),
		);
	}

	// Score.
	for (const t of group) {
		if (done.has(t.id)) continue;
		const anchor = anchorPlacement.get(t.id)!;
		const match = probePlacement.get(`${t.id}:m`)!;
		const distractor = probePlacement.get(`${t.id}:d`)!;
		const synthRecall = match.clusterId === anchor.clusterId && match.synthId === anchor.synthId;
		const falseMerge =
			distractor.clusterId === anchor.clusterId && distractor.synthId === anchor.synthId;
		const distractorSynth = state.clusters[distractor.clusterId].synths.find(
			(s) => s.id === distractor.synthId,
		)!;

		appendJsonl(RESULT_FILE, {
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

	appendJsonl(SUMMARY_FILE, {
		dataset,
		model,
		statements: state.statements.size,
		clusters: state.clusters.length,
		synths: state.clusters.reduce((n, c) => n + c.synths.length, 0),
		calls: state.calls,
		meanClusterList:
			state.clusterListSizes.reduce((a, b) => a + b, 0) / (state.clusterListSizes.length || 1),
		meanSynthList:
			state.synthListSizes.reduce((a, b) => a + b, 0) / (state.synthListSizes.length || 1),
	});
	console.info(`[${dataset}] done — calls: ${JSON.stringify(state.calls)}`);
}

async function main(): Promise<void> {
	const { limit, sample, model } = parseArgs();
	let triplets = loadTriplets('main');
	if (sample) {
		const ids = new Set(JSON.parse(readFileSync(sample, 'utf8')) as string[]);
		triplets = triplets.filter((t) => ids.has(t.id));
	}
	if (limit) triplets = triplets.slice(0, limit);

	const done = doneIds(RESULT_FILE);
	const byDataset = new Map<string, Triplet[]>();
	for (const t of triplets) {
		const arr = byDataset.get(t.dataset) ?? [];
		arr.push(t);
		byDataset.set(t.dataset, arr);
	}

	const pending = [...byDataset.entries()].filter(([, group]) =>
		group.some((t) => !done.has(t.id)),
	);
	console.info(`model=${model} · ${pending.length}/${byDataset.size} datasets to replay`);
	await Promise.all(
		pending.map(([dataset, group]) => replayDataset(dataset, group, model, done)),
	);
	console.info(`Done → ${resultsPath(RESULT_FILE)}`);
}

main().catch((error) => {
	console.error('run-sim-e failed:', error);
	process.exit(1);
});
