/**
 * Corpus geometry pre-flight for the live-synth accuracy benchmark.
 *
 * The live pipeline routes every arriving option by embedding cosine against its
 * neighbours, so a corpus whose geometry does not suit the mechanism measures the
 * DATASET rather than the mechanism. This script embeds a corpus exactly the way
 * production does and reports:
 *
 *   1. the three cosine distributions (within-pair / cross-synth-same-topic / cross-topic);
 *   2. SEPARABILITY — is each statement's ground-truth partner its nearest
 *      neighbour? Rank-based, so it is comparable ACROSS LANGUAGES, and it is the
 *      real ceiling: a partner ranked beyond NEIGHBOR_LIMIT (10) is never even
 *      considered by the pipeline;
 *   3. the best pairwise F1 any single cosine cut could reach — the ceiling for
 *      threshold tuning alone. When it is already low, no `--set` experiment helps.
 *
 * Corpus quality is gated on (2), not on absolute cosine, because the absolute
 * scale is language-dependent. Measured on this corpus with text-embedding-3-small:
 * English separability 100/100 but Hebrew only 56/100, with the Hebrew cross-topic
 * median (0.78) exceeding the English cross-SYNTH median (0.71). Absolute-threshold
 * comparisons are therefore reported as per-language CONFIGURATION diagnostics.
 *
 * No emulator and no Firestore needed — only OPENAI_API_KEY from functions/.env.
 *
 * USAGE
 *   npx tsx scripts/preflightCorpusCosines.ts scripts/seedSynthBenchmark.accuracy100.en.json
 *   npx tsx scripts/preflightCorpusCosines.ts scripts/seedSynthBenchmark.accuracy100.he.json
 *
 *   --json          machine-readable output
 *   --no-context    embed the bare statement (diagnostic: isolates how much cosine
 *                   compression comes from the shared question prefix)
 *   --model=NAME    try another embedding model, e.g. text-embedding-3-large
 *
 * Exits non-zero when a statement's ground-truth partner falls outside
 * NEIGHBOR_LIMIT, so it can gate a benchmark run in a script or CI.
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dir, '..');
const CACHE_DIR = resolve(REPO_ROOT, 'scripts/.cache');
const CACHE_FILE = resolve(CACHE_DIR, 'preflight-embeddings.jsonl');

/**
 * Load OPENAI_API_KEY from functions/.env before importing any production
 * module — `getOpenAI()` reads the key at first call, and the config module
 * throws if it is absent. Same minimal KEY=VALUE parser the claim-registry
 * benchmark uses (scientific-research/20206-07-16-Claim-regestry/benchmark/lib/env.ts);
 * duplicated rather than imported so this script has no cross-study dependency.
 */
function loadEnv(): void {
	const envPath = resolve(REPO_ROOT, 'functions/.env');
	if (!existsSync(envPath)) {
		throw new Error(
			`functions/.env not found at ${envPath}. It is generated — run \`npm run env:dev\` first.`,
		);
	}
	for (const line of readFileSync(envPath, 'utf8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (!(key in process.env)) process.env[key] = value;
	}
	if (!process.env.OPENAI_API_KEY) {
		throw new Error(`OPENAI_API_KEY not found in ${envPath}`);
	}
}

loadEnv();

const { getOpenAI } = await import('../functions/src/config/openai-chat');

// Mirrors DEFAULT_SYNTHESIS_SETTINGS in functions/src/synthesis/pipeline/types.ts.
// Kept as literals (not imported) so the pre-flight reports against the shipped
// defaults even while an experiment is overriding them per-question.
const ATTACH_THRESHOLD = 0.85;
const SYNTH_LOWER_BOUND = 0.78;
const CLUSTER_THRESHOLD = 0.6;

// runSinglePipeline only ever inspects this many vector-search neighbours
// (NEIGHBOR_LIMIT in functions/src/synthesis/pipeline/runSinglePipeline.ts), so a
// partner ranked below it is structurally unreachable no matter the thresholds.
const NEIGHBOR_LIMIT = 10;

// Production model (functions/src/services/embedding-service.ts). Overridable with
// --model so the pre-flight can answer "would a stronger model fix this language?"
// without touching production config.
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const EXPECTED_TOPICS = 10;
const EXPECTED_SYNTHS_PER_TOPIC = 5;
const EXPECTED_PARAPHRASES_PER_SYNTH = 2;

interface SynthGroup {
	name: string;
	paraphrases: string[];
}
interface TopicGroup {
	name: string;
	synths: SynthGroup[];
}
interface CorpusFile {
	questionId: string;
	questionText: string;
	language?: string;
	design?: string;
	topics: TopicGroup[];
}
interface CorpusItem {
	text: string;
	topicName: string;
	synthName: string;
	/** Production embedding input: "Question: <parent text>\nAnswer: <option>". */
	embeddingInput: string;
}
interface CacheRow {
	key: string;
	vector: number[];
}

function parseArgs(): { corpusPath: string; asJson: boolean; noContext: boolean; model: string; dimensions: number | null } {
	const args = process.argv.slice(2);
	const corpusPath = args.find((a) => !a.startsWith('--'));
	if (!corpusPath) {
		console.error(
			'Usage: npx tsx scripts/preflightCorpusCosines.ts <corpus.json> [--json] [--no-context]',
		);
		process.exit(1);
	}

	return {
		corpusPath: resolve(corpusPath),
		asJson: args.includes('--json'),
		// Diagnostic: embed the bare statement instead of the production
		// `"Question: …\nAnswer: …"` form. Comparing the two runs isolates how much
		// of the cosine compression comes from the shared question prefix rather
		// than from the model's representation of the language itself.
		noContext: args.includes('--no-context'),
		model: args.find((a) => a.startsWith('--model='))?.slice('--model='.length) ?? DEFAULT_EMBEDDING_MODEL,
		// The production vector index is fixed at 1536 dimensions
		// (firestore.indexes.json), so a larger model is only a drop-in candidate
		// if it is requested at 1536 dims — which OpenAI supports natively.
		dimensions: args.some((a) => a.startsWith('--dimensions='))
			? Number(args.find((a) => a.startsWith('--dimensions='))!.slice('--dimensions='.length))
			: null,
	};
}

/**
 * Structural validation. A silently malformed corpus (9 topics, a synth with 3
 * paraphrases) would make every downstream score wrong in a way that looks like
 * a mechanism regression, so this is a hard failure rather than a warning.
 */
function validateStructure(corpus: CorpusFile): string[] {
	const problems: string[] = [];
	if (corpus.topics.length !== EXPECTED_TOPICS) {
		problems.push(`expected ${EXPECTED_TOPICS} topics, got ${corpus.topics.length}`);
	}
	const seenTopics = new Set<string>();
	for (const topic of corpus.topics) {
		if (seenTopics.has(topic.name)) problems.push(`duplicate topic name "${topic.name}"`);
		seenTopics.add(topic.name);
		if (topic.synths.length !== EXPECTED_SYNTHS_PER_TOPIC) {
			problems.push(
				`topic "${topic.name}": expected ${EXPECTED_SYNTHS_PER_TOPIC} synths, got ${topic.synths.length}`,
			);
		}
		const seenSynths = new Set<string>();
		for (const synth of topic.synths) {
			if (seenSynths.has(synth.name)) {
				problems.push(`topic "${topic.name}": duplicate synth name "${synth.name}"`);
			}
			seenSynths.add(synth.name);
			if (synth.paraphrases.length !== EXPECTED_PARAPHRASES_PER_SYNTH) {
				problems.push(
					`synth "${topic.name}/${synth.name}": expected ${EXPECTED_PARAPHRASES_PER_SYNTH} paraphrases, got ${synth.paraphrases.length}`,
				);
			}
			for (const text of synth.paraphrases) {
				if (!text || !text.trim()) {
					problems.push(`synth "${topic.name}/${synth.name}": empty paraphrase`);
				}
			}
		}
	}

	return problems;
}

function flatten(corpus: CorpusFile, noContext: boolean): CorpusItem[] {
	const items: CorpusItem[] = [];
	for (const topic of corpus.topics) {
		for (const synth of topic.synths) {
			for (const text of synth.paraphrases) {
				items.push({
					text,
					topicName: topic.name,
					synthName: synth.name,
					// Must match functions/src/services/embedding-service.ts exactly —
					// a contextless vector lands in a different subspace than the
					// stored ones (see pipeline/embedding.ts docs), so `--no-context`
					// is a diagnostic only, never the production comparison.
					embeddingInput: noContext ? text : `Question: ${corpus.questionText}\nAnswer: ${text}`,
				});
			}
		}
	}

	return items;
}

function readCache(): Map<string, number[]> {
	const cache = new Map<string, number[]>();
	if (!existsSync(CACHE_FILE)) return cache;
	for (const line of readFileSync(CACHE_FILE, 'utf8').split('\n').filter(Boolean)) {
		const row = JSON.parse(line) as CacheRow;
		cache.set(row.key, row.vector);
	}

	return cache;
}

/** Embeds only inputs missing from the on-disk cache, so re-runs after a text tweak are nearly free. */
async function embedWithCache(
	inputs: string[],
	model: string,
	dimensions: number | null,
): Promise<Map<string, number[]>> {
	// Cache key includes model + dimensions so switching either does not read stale vectors.
	const keyOf = (input: string): string => `${model}@${dimensions ?? 'native'}\u0000${input}`;
	const rawCache = readCache();
	const cache = new Map<string, number[]>();
	for (const input of new Set(inputs)) {
		const cached = rawCache.get(keyOf(input));
		if (cached) cache.set(input, cached);
	}
	const missing = [...new Set(inputs)].filter((input) => !cache.has(input));
	if (missing.length === 0) {
		console.info(`✓ all ${inputs.length} embeddings served from cache`);

		return cache;
	}

	console.info(`Embedding ${missing.length} new texts with ${model} (${inputs.length - missing.length} cached)…`);
	mkdirSync(CACHE_DIR, { recursive: true });
	const openai = getOpenAI();
	for (let i = 0; i < missing.length; i += 100) {
		const batch = missing.slice(i, i + 100);
		const response = await openai.embeddings.create({
			model,
			input: batch,
			...(dimensions ? { dimensions } : {}),
		});
		batch.forEach((input, j) => {
			const vector = response.data[j].embedding;
			cache.set(input, vector);
			appendFileSync(CACHE_FILE, JSON.stringify({ key: keyOf(input), vector } satisfies CacheRow) + '\n');
		});
		process.stdout.write(`  embedded ${Math.min(i + batch.length, missing.length)}/${missing.length}\n`);
	}

	return cache;
}

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface Distribution {
	label: string;
	values: number[];
	min: number;
	p10: number;
	median: number;
	p90: number;
	max: number;
	mean: number;
}

function describe(label: string, values: number[]): Distribution {
	const sorted = [...values].sort((x, y) => x - y);
	const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

	return {
		label,
		values,
		min: sorted[0] ?? NaN,
		p10: at(0.1),
		median: at(0.5),
		p90: at(0.9),
		max: sorted[sorted.length - 1] ?? NaN,
		mean: values.reduce((s, v) => s + v, 0) / (values.length || 1),
	};
}

interface ThresholdScore {
	threshold: number;
	precision: number;
	recall: number;
	f1: number;
}

/** Pairwise precision/recall/F1 for "same synth" prediction at one cosine cut. */
function f1AtThreshold(
	labelled: Array<{ c: number; positive: boolean }>,
	threshold: number,
): ThresholdScore {
	let tp = 0;
	let fp = 0;
	let fn = 0;
	for (const { c, positive } of labelled) {
		const predicted = c >= threshold;
		if (predicted && positive) tp++;
		else if (predicted && !positive) fp++;
		else if (!predicted && positive) fn++;
	}
	const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
	const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
	const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

	return { threshold, precision, recall, f1 };
}

/**
 * Best F1 achievable by ANY single cosine cut on this corpus — the ceiling for
 * threshold tuning alone. When this is already low (as it is for Hebrew), moving
 * `attachThreshold` cannot rescue the score and the fix has to come from
 * elsewhere: the claim-registry pass, or a different embedding model.
 */
function bestSingleThreshold(labelled: Array<{ c: number; positive: boolean }>): ThresholdScore {
	const candidates = [...new Set(labelled.map((l) => Number(l.c.toFixed(4))))].sort((a, b) => a - b);
	let best: ThresholdScore = { threshold: NaN, precision: 0, recall: 0, f1: -1 };
	for (const threshold of candidates) {
		const score = f1AtThreshold(labelled, threshold);
		if (score.f1 > best.f1) best = score;
	}

	return best;
}

/**
 * Corpus quality is judged by RANK, not by absolute cosine.
 *
 * Absolute cosine scale is language-dependent: the same corpus translated to
 * Hebrew compresses into a much narrower, much higher band with
 * text-embedding-3-small (observed: EN cross-topic median 0.63 vs HE 0.78 — the
 * HE cross-topic median exceeds the EN cross-SYNTH median). Judging a Hebrew
 * corpus against thresholds tuned on English therefore reports hundreds of
 * "defects" for what is one systemic property of the embedding space, burying
 * any real authoring mistake.
 *
 * What IS language-independent is ordering: a well-formed corpus is one where
 * every statement's ground-truth partner is its nearest neighbour. That holds
 * regardless of the absolute scale, so it is the gate. Absolute-threshold
 * comparisons are still reported — as per-language CONFIGURATION diagnostics,
 * telling you which `--set` bands this language needs.
 */
interface CorpusDefect {
	kind:
		| 'partner-not-nearest' // some other statement is closer than the true partner
		| 'partner-outside-neighbor-limit'; // partner beyond top-10: pipeline never sees it
	statement: string;
	label: string;
	partnerRank: number;
	partnerCosine: number;
	/** The nearest non-partner that outranks the true partner, when there is one. */
	intruder?: string;
	intruderLabel?: string;
	intruderCosine?: number;
}

interface ThresholdDiagnostic {
	kind: 'pair-below-synth-floor' | 'cross-synth-above-attach' | 'cross-topic-above-attach';
	cosine: number;
	a: string;
	b: string;
	aLabel: string;
	bLabel: string;
}

(async () => {
	const { corpusPath, asJson, noContext, model, dimensions } = parseArgs();
	const corpus: CorpusFile = JSON.parse(readFileSync(corpusPath, 'utf8'));

	console.info(`\n=== Corpus geometry pre-flight ===`);
	console.info(`file     : ${corpusPath}`);
	console.info(`question : ${corpus.questionText}`);
	console.info(`language : ${corpus.language ?? '(unspecified)'}`);
	console.info(
		`embedding: ${model}${dimensions ? `@${dimensions}d` : ''}${model === DEFAULT_EMBEDDING_MODEL && !dimensions ? ' (production)' : ' (OVERRIDE)'}, ${noContext ? 'BARE STATEMENT (--no-context diagnostic)' : 'production "Question: …\\nAnswer: …"'}`,
	);

	const structural = validateStructure(corpus);
	if (structural.length > 0) {
		console.error('\n✗ STRUCTURAL PROBLEMS:');
		for (const p of structural) console.error(`  - ${p}`);
		process.exit(1);
	}
	const items = flatten(corpus, noContext);
	console.info(
		`structure: ✓ ${corpus.topics.length} topics × ${EXPECTED_SYNTHS_PER_TOPIC} synths × ${EXPECTED_PARAPHRASES_PER_SYNTH} paraphrases = ${items.length} statements\n`,
	);

	const cache = await embedWithCache(items.map((i) => i.embeddingInput), model, dimensions);
	const vectors = items.map((i) => cache.get(i.embeddingInput)!);

	const withinPair: number[] = [];
	const crossSynthSameTopic: number[] = [];
	const crossTopic: number[] = [];
	const diagnostics: ThresholdDiagnostic[] = [];
	// Full cosine matrix, kept for the rank-based separability analysis below.
	const matrix: number[][] = Array.from({ length: items.length }, () => new Array(items.length).fill(0));
	// (cosine, isSameSynth) over all pairs — input to the oracle threshold sweep.
	const labelled: Array<{ c: number; positive: boolean }> = [];

	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			const a = items[i];
			const b = items[j];
			const c = cosine(vectors[i], vectors[j]);
			matrix[i][j] = c;
			matrix[j][i] = c;
			const sameTopic = a.topicName === b.topicName;
			const sameSynth = sameTopic && a.synthName === b.synthName;
			labelled.push({ c, positive: sameSynth });
			const record = (kind: ThresholdDiagnostic['kind']): void => {
				diagnostics.push({
					kind,
					cosine: c,
					a: a.text,
					b: b.text,
					aLabel: `${a.topicName}/${a.synthName}`,
					bLabel: `${b.topicName}/${b.synthName}`,
				});
			};

			if (sameSynth) {
				withinPair.push(c);
				if (c < SYNTH_LOWER_BOUND) record('pair-below-synth-floor');
			} else if (sameTopic) {
				crossSynthSameTopic.push(c);
				if (c >= ATTACH_THRESHOLD) record('cross-synth-above-attach');
			} else {
				crossTopic.push(c);
				if (c >= ATTACH_THRESHOLD) record('cross-topic-above-attach');
			}
		}
	}

	// Separability (rank-based, language-independent): is each statement's
	// ground-truth partner its nearest neighbour? This bounds what ANY
	// cosine-driven pipeline can achieve — when the partner is not the top
	// neighbour no threshold recovers that pair, and once it falls outside
	// NEIGHBOR_LIMIT the pipeline never even considers it. Only the
	// claim-registry pass can reach past that ceiling.
	const partnerRanks: number[] = [];
	const defects: CorpusDefect[] = [];
	for (let i = 0; i < items.length; i++) {
		const ranked = items
			.map((item, j) => ({ j, item, c: matrix[i][j] }))
			.filter((r) => r.j !== i)
			.sort((x, y) => y.c - x.c);
		const isPartner = (item: CorpusItem): boolean =>
			item.topicName === items[i].topicName && item.synthName === items[i].synthName;
		const rankIndex = ranked.findIndex((r) => isPartner(r.item));
		const rank = rankIndex + 1;
		partnerRanks.push(rank);

		if (rank > 1) {
			const intruder = ranked[0];
			defects.push({
				kind: rank > NEIGHBOR_LIMIT ? 'partner-outside-neighbor-limit' : 'partner-not-nearest',
				statement: items[i].text,
				label: `${items[i].topicName}/${items[i].synthName}`,
				partnerRank: rank,
				partnerCosine: ranked[rankIndex].c,
				intruder: intruder.item.text,
				intruderLabel: `${intruder.item.topicName}/${intruder.item.synthName}`,
				intruderCosine: intruder.c,
			});
		}
	}
	const partnerIsNearest = partnerRanks.filter((r) => r === 1).length;
	const partnerInTop3 = partnerRanks.filter((r) => r <= 3).length;
	const partnerInTop10 = partnerRanks.filter((r) => r <= NEIGHBOR_LIMIT).length;

	const dists = [
		describe('within-pair (same synth)', withinPair),
		describe('cross-synth, same topic', crossSynthSameTopic),
		describe('cross-topic', crossTopic),
	];

	const oracle = bestSingleThreshold(labelled);
	const atDefault = f1AtThreshold(labelled, ATTACH_THRESHOLD);
	// A corpus defect is a genuine authoring collision (rank-based); threshold
	// diagnostics are configuration facts about this language, not corpus errors.
	const hardDefects = defects.filter((d) => d.kind === 'partner-outside-neighbor-limit');
	const crossTopicAboveClusterGate = crossTopic.filter((c) => c >= CLUSTER_THRESHOLD).length;

	if (asJson) {
		console.info(
			JSON.stringify(
				{
					corpusPath,
					language: corpus.language,
					distributions: dists.map(({ values, ...rest }) => ({ ...rest, n: values.length })),
					separability: {
						partnerIsNearest,
						partnerInTop3,
						partnerInTop10,
						total: items.length,
						worstRank: Math.max(...partnerRanks),
					},
					oracleThreshold: oracle,
					atShippedAttachThreshold: atDefault,
					crossTopicAboveClusterGate,
					crossTopicTotal: crossTopic.length,
					defects,
					thresholdDiagnostics: diagnostics,
				},
				null,
				2,
			),
		);
	} else {
		console.info('\n--- cosine distributions ---');
		console.info(
			`${'band'.padEnd(26)} ${'n'.padStart(5)} ${'min'.padStart(6)} ${'p10'.padStart(6)} ${'median'.padStart(7)} ${'p90'.padStart(6)} ${'max'.padStart(6)}`,
		);
		for (const d of dists) {
			console.info(
				`${d.label.padEnd(26)} ${String(d.values.length).padStart(5)} ${d.min.toFixed(3).padStart(6)} ${d.p10.toFixed(3).padStart(6)} ${d.median.toFixed(3).padStart(7)} ${d.p90.toFixed(3).padStart(6)} ${d.max.toFixed(3).padStart(6)}`,
			);
		}

		console.info('\n--- gates (shipped defaults) ---');
		console.info(`attachThreshold  = ${ATTACH_THRESHOLD}   (pairs at/above here attach as a synth)`);
		console.info(`synthLowerBound  = ${SYNTH_LOWER_BOUND}   (pairs below here cannot spawn a synth)`);
		console.info(`clusterThreshold = ${CLUSTER_THRESHOLD}    (above here two options share a topic cluster)`);

		const pairsBelow = withinPair.filter((c) => c < ATTACH_THRESHOLD).length;
		console.info(
			`\nwithin-pair below attachThreshold : ${pairsBelow}/${withinPair.length} — these rely on spawn (band router), not Pass-1 attach`,
		);

		// The number that actually bounds achievable accuracy on this corpus.
		console.info('\n--- separability (upper bound for any cosine-driven pipeline) ---');
		console.info(
			`ground-truth partner is nearest neighbour : ${partnerIsNearest}/${items.length} (${((100 * partnerIsNearest) / items.length).toFixed(0)}%)`,
		);
		console.info(`partner within top 3                     : ${partnerInTop3}/${items.length}`);
		console.info(
			`partner within top 10 (NEIGHBOR_LIMIT)   : ${partnerInTop10}/${items.length} — beyond this the pipeline never even sees the partner`,
		);
		console.info(`worst partner rank                       : ${Math.max(...partnerRanks)}`);

		console.info('\n--- topic-gate reality check ---');
		console.info(
			`cross-topic pairs at/above clusterThreshold (${CLUSTER_THRESHOLD}) : ${crossTopicAboveClusterGate}/${crossTopic.length} (${((100 * crossTopicAboveClusterGate) / crossTopic.length).toFixed(0)}%)`,
		);
		console.info(
			'  NOT a corpus defect: the shared "Question: …\\nAnswer: …" prefix lifts the whole cosine',
		);
		console.info(
			'  floor, so on a single-question civic corpus a 0.60 topic gate is barely selective.',
		);
		console.info(
			'  Expect heavy topic over-merging at defaults — that is a finding to tune, not a dataset fix.',
		);

		// Ceiling of threshold tuning: if the oracle F1 is already poor, no `--set`
		// experiment can fix the score and the lever has to be elsewhere.
		console.info('\n--- what threshold tuning can achieve (pairwise, synth level) ---');
		console.info(
			`at shipped attachThreshold ${ATTACH_THRESHOLD} : P=${atDefault.precision.toFixed(3)} R=${atDefault.recall.toFixed(3)} F1=${atDefault.f1.toFixed(3)}`,
		);
		console.info(
			`best possible single cut (${oracle.threshold.toFixed(3)})   : P=${oracle.precision.toFixed(3)} R=${oracle.recall.toFixed(3)} F1=${oracle.f1.toFixed(3)}  ← ceiling for threshold tuning alone`,
		);

		console.info('\n--- corpus defects (rank-based, language-independent) ---');
		if (defects.length === 0) {
			console.info('none — every statement\'s ground-truth partner is its nearest neighbour.');
		} else {
			const invisible = defects.filter((d) => d.kind === 'partner-outside-neighbor-limit');
			const notNearest = defects.filter((d) => d.kind === 'partner-not-nearest');
			console.info(
				`${notNearest.length} statement(s) whose partner is not the nearest neighbour, of which ${invisible.length} fall outside NEIGHBOR_LIMIT=${NEIGHBOR_LIMIT} (unreachable).`,
			);
			for (const d of [...defects].sort((a, b) => b.partnerRank - a.partnerRank).slice(0, 8)) {
				console.info(
					`   rank ${String(d.partnerRank).padStart(2)}  ${d.label}  (partner cos ${d.partnerCosine.toFixed(3)}, intruder ${d.intruderCosine?.toFixed(3)} from ${d.intruderLabel})`,
				);
				console.info(`          statement: ${d.statement}`);
				console.info(`          intruder : ${d.intruder}`);
			}
			if (defects.length > 8) console.info(`   … and ${defects.length - 8} more`);
		}

		const diagByKind = (kind: ThresholdDiagnostic['kind']): ThresholdDiagnostic[] =>
			diagnostics
				.filter((v) => v.kind === kind)
				.sort((x, y) =>
					kind === 'pair-below-synth-floor' ? x.cosine - y.cosine : y.cosine - x.cosine,
				);

		console.info('\n--- configuration diagnostics (language-relative, NOT corpus errors) ---');
		const diagSections = [
			['pair-below-synth-floor', `ground-truth pairs below synthLowerBound (${SYNTH_LOWER_BOUND}) — cannot form a synth at defaults`],
			['cross-synth-above-attach', `same-topic pairs from DIFFERENT synths at/above attachThreshold (${ATTACH_THRESHOLD}) — will falsely merge at defaults`],
			['cross-topic-above-attach', `cross-topic pairs at/above attachThreshold (${ATTACH_THRESHOLD}) — will falsely merge at defaults`],
		] as const;
		let anyDiag = false;
		for (const [kind, headline] of diagSections) {
			const list = diagByKind(kind);
			if (list.length === 0) continue;
			anyDiag = true;
			console.info(`\n  ${list.length} ${headline}:`);
			for (const v of list.slice(0, 6)) {
				console.info(`   ${v.cosine.toFixed(3)}  ${v.aLabel} ↔ ${v.bLabel}`);
				console.info(`          A: ${v.a}`);
				console.info(`          B: ${v.b}`);
			}
			if (list.length > 6) console.info(`   … and ${list.length - 6} more`);
		}
		if (!anyDiag) console.info('  none — shipped thresholds separate this corpus cleanly.');

		if (hardDefects.length === 0 && defects.length === 0) {
			console.info('\n✅ PASS — corpus is well-formed; every partner is a nearest neighbour.');
		} else if (hardDefects.length === 0) {
			console.info(
				`\n✅ PASS (with caveats) — no unreachable partners, but ${defects.length} partner(s) are not nearest-neighbour. Achievable pair recall is capped near ${((100 * partnerInTop10) / items.length).toFixed(0)}%.`,
			);
		} else {
			console.info(
				`\n✗ FAIL — ${hardDefects.length} statement(s) have their partner outside NEIGHBOR_LIMIT=${NEIGHBOR_LIMIT};`,
			);
			console.info(
				`  the pipeline can never see those pairs. Pair recall is hard-capped at ${((100 * partnerInTop10) / items.length).toFixed(0)}% for this corpus + embedding model.`,
			);
			console.info(
				'  If the statements are faithful translations of a clean corpus, this is an EMBEDDING-MODEL',
			);
			console.info(
				'  finding, not an authoring defect — record it and enable the claim-registry pass, which',
			);
			console.info('  classifies by meaning instead of cosine rank.');
		}
	}

	process.exit(hardDefects.length === 0 ? 0 : 2);
})().catch((error) => {
	console.error('Pre-flight failed:', error);
	process.exit(1);
});
