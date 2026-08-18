/**
 * Live clustering-and-synthesis accuracy benchmark (emulator only).
 *
 * Feeds a 100-statement corpus (10 topics x 5 synth-groups x 2 near-paraphrases)
 * into the Firestore emulator ONE AT A TIME in a seeded-shuffled order, letting the
 * real production triggers (`liveSynthOnOptionCreate` → `runSinglePipeline`) do the
 * clustering, then exports what the pipeline built so `score100.mjs` can grade it
 * against the ground truth.
 *
 * Shuffled arrival is the point: the sibling seeder (scripts/seedSynthBenchmark.ts)
 * defaults to feeding all paraphrases of one synth consecutively, which makes attach
 * decisions easy. Real participants arrive interleaved, so this harness always
 * shuffles and records the seed for reproducibility.
 *
 * SCHEDULED FUNCTIONS DO NOT FIRE IN THE EMULATOR, so the convergence layer is
 * pumped manually between batches, reusing the existing emulator-only pumps rather
 * than reimplementing them:
 *   - functions/scripts/runReJudgeMerge.ts    (fn_synthesisReJudge, cross-synth merge)
 *   - functions/scripts/drainSynthesisQueue.ts (processSynthesisQueue)
 * `fn_clusterRecomputeFlush` is deliberately NOT pumped: it recomputes evaluation
 * aggregates and polarization for clusters whose members were evaluated, and this
 * benchmark submits no evaluations, so it would be a no-op.
 *
 * PREREQUISITES
 *   1. env/.env.dev has OPENAI_API_KEY and SYNTHESIS_LIVE_SYNTH_ENABLED=true,
 *      then `npm run env:dev` (functions/.env is GENERATED — editing it directly
 *      does not survive).
 *   2. `npm run deve` — both the Firestore and Functions emulators must be up, or
 *      the triggers never run and every statement stays a singleton.
 *
 * USAGE
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/runAccuracyBenchmark.ts scripts/seedSynthBenchmark.accuracy100.en.json
 *
 *   --seed=42              shuffle seed (default 42; record it with any result)
 *   --set k=v              per-question synthesis override, repeatable, e.g.
 *                          --set attachThreshold=0.83 --set claimRegistryEnabled=true
 *                          (resolved by loadSynthesisSettingsFromStatement, so no
 *                          code edit is needed to run a threshold experiment)
 *   --limit=N              only feed the first N statements (smoke test)
 *   --pump-every=N         run the queue drain every N statements (default 10)
 *   --rejudge-every=N      run the cross-synth merge every N pump cycles (default 5)
 *   --min-wait-ms=N        minimum wait after each write before settle detection (default 4000)
 *   --quiet-ms=N           unchanged-state window that counts as settled (default 2500)
 *   --max-wait-ms=N        hard cap on the per-statement wait (default 20000)
 *   --out=DIR              output folder (default: a timestamped run folder)
 *   --keep                 do not delete existing children first (append to a run)
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createStatementObject } from '../packages/shared-types/src/models/statement/StatementUtils';
import { StatementType } from '../packages/shared-types/src/models/TypeEnums';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePath(__dir, '..');
const FUNCTIONS_DIR = resolvePath(REPO_ROOT, 'functions');
const STUDY_DIR = resolvePath(REPO_ROOT, 'scientific-research/2026-08-18-live-synth-accuracy');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set. This script is emulator-only.');
	process.exit(1);
}

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

interface Options {
	corpusPath: string;
	seed: number;
	overrides: Record<string, string>;
	limit: number | null;
	pumpEvery: number;
	rejudgeEvery: number;
	minWaitMs: number;
	quietMs: number;
	maxWaitMs: number;
	outDir: string | null;
	keep: boolean;
}

function parseArgs(): Options {
	const argv = process.argv.slice(2);
	const corpusPath = argv.find((a) => !a.startsWith('--'));
	if (!corpusPath) {
		console.error('Usage: npx tsx scripts/runAccuracyBenchmark.ts <corpus.json> [flags]');
		process.exit(1);
	}
	const num = (flag: string, fallback: number): number => {
		const raw = argv.find((a) => a.startsWith(`--${flag}=`));

		return raw ? Number(raw.slice(flag.length + 3)) : fallback;
	};
	const overrides: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] !== '--set') continue;
		const pair = argv[i + 1];
		if (!pair || !pair.includes('=')) {
			console.error('--set expects key=value, e.g. --set attachThreshold=0.83');
			process.exit(1);
		}
		const eq = pair.indexOf('=');
		overrides[pair.slice(0, eq)] = pair.slice(eq + 1);
	}
	const outRaw = argv.find((a) => a.startsWith('--out='));

	return {
		corpusPath: resolvePath(corpusPath),
		seed: num('seed', 42),
		overrides,
		limit: argv.some((a) => a.startsWith('--limit=')) ? num('limit', 0) : null,
		pumpEvery: num('pump-every', 10),
		rejudgeEvery: num('rejudge-every', 5),
		minWaitMs: num('min-wait-ms', 4000),
		quietMs: num('quiet-ms', 2500),
		maxWaitMs: num('max-wait-ms', 20000),
		outDir: outRaw ? resolvePath(outRaw.slice('--out='.length)) : null,
		keep: argv.includes('--keep'),
	};
}

const opts = parseArgs();
const corpus: CorpusFile = JSON.parse(readFileSync(opts.corpusPath, 'utf-8'));
const corpusSha = createHash('sha256').update(readFileSync(opts.corpusPath)).digest('hex').slice(0, 12);

if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}
const db = getFirestore();

const QUESTION_ID = corpus.questionId;
const USER_UID = process.env.SEED_USER_UID ?? 'dDKeLPe8IC6EOttQ5Ih6Y9ZXcXfY';
const CREATOR = {
	uid: USER_UID,
	displayName: 'Accuracy Benchmark Harness',
	email: 'accuracy.benchmark@example.com',
	photoURL: null,
	isAnonymous: false,
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Deterministic PRNG so a given --seed always produces the same arrival order. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;

	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

interface SeedItem {
	id: string;
	text: string;
	groundTruthTopic: string;
	groundTruthSynth: string;
}

function buildArrivalOrder(): SeedItem[] {
	const flat: SeedItem[] = [];
	for (const topic of corpus.topics) {
		for (const synth of topic.synths) {
			for (const text of synth.paraphrases) {
				flat.push({
					id: '',
					text,
					groundTruthTopic: topic.name,
					groundTruthSynth: `${topic.name}/${synth.name}`,
				});
			}
		}
	}
	// Fisher-Yates with the seeded PRNG.
	const rand = mulberry32(opts.seed);
	for (let i = flat.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[flat[i], flat[j]] = [flat[j], flat[i]];
	}

	return opts.limit === null ? flat : flat.slice(0, opts.limit);
}

function validateStructure(): void {
	const problems: string[] = [];
	if (corpus.topics.length !== 10) problems.push(`expected 10 topics, got ${corpus.topics.length}`);
	for (const topic of corpus.topics) {
		if (topic.synths.length !== 5) {
			problems.push(`topic "${topic.name}" has ${topic.synths.length} synths, expected 5`);
		}
		for (const synth of topic.synths) {
			if (synth.paraphrases.length !== 2) {
				problems.push(
					`synth "${topic.name}/${synth.name}" has ${synth.paraphrases.length} paraphrases, expected 2`,
				);
			}
		}
	}
	if (problems.length > 0) {
		console.error('✗ Corpus structure invalid:');
		for (const p of problems) console.error(`  - ${p}`);
		process.exit(1);
	}
}

/** Coerce --set values to the type each synthesis setting expects. */
function coerceOverrides(raw: Record<string, string>): Record<string, number | boolean> {
	const numeric = new Set([
		'minEvaluators',
		'minConsensus',
		'attachThreshold',
		'synthLowerBound',
		'clusterThreshold',
		'reviewLowerBound',
	]);
	const boolean = new Set(['enabled', 'claimRegistryEnabled']);
	const out: Record<string, number | boolean> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (numeric.has(key)) {
			const n = Number(value);
			if (!Number.isFinite(n)) {
				console.error(`--set ${key}: "${value}" is not a number`);
				process.exit(1);
			}
			out[key] = n;
		} else if (boolean.has(key)) {
			out[key] = value === 'true' || value === '1';
		} else {
			console.error(
				`--set ${key}: unknown synthesis setting. Known keys: ${[...numeric, ...boolean].join(', ')}`,
			);
			process.exit(1);
		}
	}

	return out;
}

async function deleteExistingChildren(): Promise<number> {
	const snap = await db.collection('statements').where('parentId', '==', QUESTION_ID).get();
	let deleted = 0;
	for (let i = 0; i < snap.docs.length; i += 400) {
		const batch = db.batch();
		for (const doc of snap.docs.slice(i, i + 400)) {
			batch.delete(doc.ref);
			deleted++;
		}
		await batch.commit();
	}
	// Internal side collections that would otherwise leak state between runs.
	for (const collection of ['_synthAuditLog', '_liveSynthCandidates']) {
		const side = await db.collection(collection).where('parentStatementId', '==', QUESTION_ID).get();
		const alt = side.empty
			? await db.collection(collection).where('parentId', '==', QUESTION_ID).get()
			: side;
		for (let i = 0; i < alt.docs.length; i += 400) {
			const batch = db.batch();
			for (const doc of alt.docs.slice(i, i + 400)) batch.delete(doc.ref);
			await batch.commit();
		}
	}
	const queueItems = await db
		.collection('synthesisQueue')
		.doc(QUESTION_ID)
		.collection('items')
		.get();
	for (const doc of queueItems.docs) await doc.ref.delete();

	return deleted;
}

async function ensureQuestion(settingsOverrides: Record<string, number | boolean>): Promise<void> {
	const ref = db.collection('statements').doc(QUESTION_ID);
	const snap = await ref.get();
	const now = Date.now();
	// `enabled: true` is required because live synth defaults OFF for non-MC
	// questions; the rest of the block is whatever the experiment asked for and is
	// merged over DEFAULT_SYNTHESIS_SETTINGS by loadSynthesisSettingsFromStatement.
	const synthesis = { enabled: true, ...settingsOverrides };

	if (snap.exists) {
		await ref.set(
			{ statementSettings: { synthesis, liveSynthEnabled: true }, lastUpdate: now },
			{ merge: true },
		);
		console.info(`✓ question ${QUESTION_ID} exists — synthesis settings applied`);

		return;
	}

	const question = createStatementObject({
		statement: corpus.questionText,
		statementType: StatementType.question,
		parentId: 'top',
		topParentId: QUESTION_ID,
		creatorId: USER_UID,
		creator: CREATOR as never,
	});
	if (!question) throw new Error('createStatementObject failed for the benchmark question');

	await ref.set({
		...question,
		// Fixed id so a run is repeatable and both language questions can coexist.
		statementId: QUESTION_ID,
		topParentId: QUESTION_ID,
		// Public access, else useAuthorization hangs when inspecting the run in the UI.
		membership: { access: 'public' },
		statementSettings: { ...question.statementSettings, synthesis, liveSynthEnabled: true },
	});
	console.info(`+ created question ${QUESTION_ID}`);
}

/**
 * Fingerprint of everything the pipeline could touch for this question. Settle
 * detection compares successive fingerprints rather than looking for a per-option
 * "done" marker, because `runSinglePipeline` does not stamp its verdict on the
 * option and the singleton/skipped paths write nothing at all.
 */
async function fingerprint(): Promise<string> {
	const [children, audit] = await Promise.all([
		db.collection('statements').where('parentId', '==', QUESTION_ID).get(),
		db.collection('_synthAuditLog').where('parentStatementId', '==', QUESTION_ID).get(),
	]);
	let maxUpdate = 0;
	let clusters = 0;
	for (const doc of children.docs) {
		const d = doc.data();
		maxUpdate = Math.max(maxUpdate, Number(d.lastUpdate) || 0);
		if (d.derivedByPipeline) clusters++;
	}

	return `${children.size}:${clusters}:${audit.size}:${maxUpdate}`;
}

/** Wait until the pipeline stops changing anything, or the hard cap expires. */
async function waitForSettle(): Promise<{ ms: number; timedOut: boolean }> {
	const started = Date.now();
	await sleep(opts.minWaitMs);
	let last = await fingerprint();
	let stableSince = Date.now();
	for (;;) {
		if (Date.now() - started > opts.maxWaitMs) {
			return { ms: Date.now() - started, timedOut: true };
		}
		await sleep(500);
		const current = await fingerprint();
		if (current !== last) {
			last = current;
			stableSince = Date.now();
			continue;
		}
		if (Date.now() - stableSince >= opts.quietMs) {
			return { ms: Date.now() - started, timedOut: false };
		}
	}
}

/** Reuse the existing emulator-only pump scripts instead of duplicating their logic. */
function pump(script: string, label: string): void {
	try {
		const out = execFileSync('npx', ['tsx', script, QUESTION_ID], {
			cwd: FUNCTIONS_DIR,
			encoding: 'utf-8',
			env: process.env,
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 300_000,
		});
		const merges = [...out.matchAll(/^MERGE /gm)].length;
		const processed = out.match(/total processed=(\d+)/)?.[1];
		console.info(
			`    pump ${label}: ${merges > 0 ? `${merges} merge(s)` : processed !== undefined ? `${processed} item(s)` : 'no-op'}`,
		);
	} catch (error) {
		// A failing pump must not abort a 20-minute run — record and continue.
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`    ⚠ pump ${label} failed: ${message.split('\n')[0]}`);
	}
}

interface ExportedCluster {
	id: string;
	title: string;
	members: Array<{ id: string }>;
	memberSynthIds?: string[];
	derivedByPipeline: string;
	synthesisMechanism?: string;
	hidden: boolean;
	mergedInto?: string;
}

async function exportResults(seeded: SeedItem[]): Promise<{
	synths: ExportedCluster[];
	topics: ExportedCluster[];
	sourceVisible: number;
	sourceHidden: number;
	auditCounts: Record<string, number>;
}> {
	const snap = await db.collection('statements').where('parentId', '==', QUESTION_ID).get();
	const seededIds = new Set(seeded.map((s) => s.id));
	const synths: ExportedCluster[] = [];
	const topics: ExportedCluster[] = [];
	let sourceVisible = 0;
	let sourceHidden = 0;

	const clusterIds = new Set<string>();
	for (const doc of snap.docs) {
		const d = doc.data();
		if (d.derivedByPipeline) clusterIds.add(d.statementId as string);
	}

	for (const doc of snap.docs) {
		const d = doc.data();
		const derived = d.derivedByPipeline as string | undefined;
		if (!derived) {
			if (d.statementType === StatementType.option) {
				if (d.hide) sourceHidden++;
				else sourceVisible++;
			}
			continue;
		}
		const integrated: string[] = Array.isArray(d.integratedOptions) ? d.integratedOptions : [];
		// A cluster's integratedOptions may hold raw options and/or other clusters.
		const members = integrated.filter((id) => seededIds.has(id)).map((id) => ({ id }));
		const memberSynthIds = integrated.filter((id) => clusterIds.has(id));
		const row: ExportedCluster = {
			id: d.statementId,
			title: d.statement ?? '',
			members,
			...(memberSynthIds.length > 0 ? { memberSynthIds } : {}),
			derivedByPipeline: derived,
			synthesisMechanism: d.synthesisMechanism,
			// reJudge hides the donor of a merge; a hidden cluster is not part of the
			// final structure and must not be scored.
			hidden: Boolean(d.hide),
			...(d.mergedInto ? { mergedInto: d.mergedInto as string } : {}),
		};
		if (derived === 'synthesis') synths.push(row);
		else if (derived === 'topic-cluster') topics.push(row);
	}

	const auditSnap = await db
		.collection('_synthAuditLog')
		.where('parentStatementId', '==', QUESTION_ID)
		.get();
	const auditCounts: Record<string, number> = {};
	for (const doc of auditSnap.docs) {
		const action = String(doc.data().action ?? 'unknown');
		auditCounts[action] = (auditCounts[action] ?? 0) + 1;
	}

	return { synths, topics, sourceVisible, sourceHidden, auditCounts };
}

function timestamp(): string {
	// Date.now() is fine here (this is a script, not a workflow), but the folder
	// name must sort chronologically.
	const d = new Date();
	const p = (n: number): string => String(n).padStart(2, '0');

	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

(async () => {
	validateStructure();
	const settingsOverrides = coerceOverrides(opts.overrides);
	const arrival = buildArrivalOrder();

	const outDir =
		opts.outDir ??
		join(STUDY_DIR, 'runs', `${timestamp()}-${corpus.language ?? 'xx'}-seed${opts.seed}`);
	mkdirSync(outDir, { recursive: true });

	console.info('\n=== Live-synth accuracy benchmark ===');
	console.info(`corpus   : ${opts.corpusPath} (sha ${corpusSha})`);
	console.info(`language : ${corpus.language ?? 'unspecified'}`);
	console.info(`question : ${QUESTION_ID}`);
	console.info(`arrival  : ${arrival.length} statements, seed ${opts.seed} (shuffled)`);
	console.info(
		`overrides: ${Object.keys(settingsOverrides).length > 0 ? JSON.stringify(settingsOverrides) : '(none — shipped defaults)'}`,
	);
	console.info(`out      : ${outDir}`);

	if (!opts.keep) {
		const deleted = await deleteExistingChildren();
		console.info(`\nreset: deleted ${deleted} existing child statement(s)`);
	}
	await ensureQuestion(settingsOverrides);

	const t0 = Date.now();
	let pumpCycle = 0;
	let timeouts = 0;
	console.info(`\nfeeding ${arrival.length} statements one at a time…\n`);

	for (let i = 0; i < arrival.length; i++) {
		const item = arrival[i];
		const built = createStatementObject({
			statement: item.text,
			statementType: StatementType.option,
			parentId: QUESTION_ID,
			topParentId: QUESTION_ID,
			creatorId: USER_UID,
			creator: CREATOR as never,
		});
		if (!built) throw new Error(`createStatementObject failed for: ${item.text}`);
		item.id = built.statementId;
		await db.collection('statements').doc(built.statementId).set(built);

		const settle = await waitForSettle();
		if (settle.timedOut) timeouts++;
		process.stdout.write(
			`  [${String(i + 1).padStart(3)}/${arrival.length}] ${(settle.ms / 1000).toFixed(1)}s${settle.timedOut ? ' (cap)' : ''}  ${item.groundTruthSynth}  ${item.text.slice(0, 46)}\n`,
		);

		const isLast = i + 1 === arrival.length;
		if ((i + 1) % opts.pumpEvery === 0 || isLast) {
			pumpCycle++;
			pump('scripts/drainSynthesisQueue.ts', 'queue');
			if (pumpCycle % opts.rejudgeEvery === 0 || isLast) {
				pump('scripts/runReJudgeMerge.ts', 'rejudge');
			}
		}
	}

	console.info('\nfinal convergence pump…');
	pump('scripts/drainSynthesisQueue.ts', 'queue');
	pump('scripts/runReJudgeMerge.ts', 'rejudge');
	await waitForSettle();

	const exported = await exportResults(arrival);
	const durationMs = Date.now() - t0;

	writeFileSync(
		join(outDir, 'statements.json'),
		JSON.stringify(
			{
				test: `live-synth-accuracy-${corpus.language ?? 'xx'}-seed${opts.seed}`,
				language: corpus.language ?? 'unknown',
				question: corpus.questionText,
				questionId: QUESTION_ID,
				corpus: opts.corpusPath.replace(`${REPO_ROOT}/`, ''),
				corpusSha,
				seed: opts.seed,
				statements: arrival.map((a, index) => ({
					id: a.id,
					text: a.text,
					groundTruthTopic: a.groundTruthTopic,
					groundTruthSynth: a.groundTruthSynth,
					arrivalIndex: index,
				})),
			},
			null,
			2,
		),
	);

	// Hidden clusters (reJudge merge donors) are excluded from what gets scored but
	// kept in the file so a run can be audited after the fact.
	writeFileSync(
		join(outDir, 'results.json'),
		JSON.stringify(
			{
				synths: { items: exported.synths.filter((s) => !s.hidden) },
				topicClusters: { items: exported.topics.filter((t) => !t.hidden) },
				hiddenClusters: [...exported.synths, ...exported.topics].filter((c) => c.hidden),
				sourceOptions: { visible: exported.sourceVisible, hidden: exported.sourceHidden },
				auditCounts: exported.auditCounts,
				parameters: {
					language: corpus.language ?? 'unknown',
					corpus: opts.corpusPath.replace(`${REPO_ROOT}/`, ''),
					corpusSha,
					seed: opts.seed,
					synthesisOverrides: settingsOverrides,
					statementsFed: arrival.length,
					pumpEvery: opts.pumpEvery,
					rejudgeEvery: opts.rejudgeEvery,
					minWaitMs: opts.minWaitMs,
					quietMs: opts.quietMs,
					maxWaitMs: opts.maxWaitMs,
					settleTimeouts: timeouts,
					durationMs,
					gitSha: (() => {
						try {
							return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
								cwd: REPO_ROOT,
								encoding: 'utf-8',
							}).trim();
						} catch {
							return 'unknown';
						}
					})(),
					models: {
						embedding: 'text-embedding-3-small',
						heavy: process.env.OPENAI_HEAVY_MODEL || 'gpt-5.6-terra',
						fast: process.env.OPENAI_FAST_MODEL || 'gpt-5.6-luna',
					},
				},
			},
			null,
			2,
		),
	);

	console.info('\n========== RUN COMPLETE ==========');
	console.info(`duration       : ${(durationMs / 1000 / 60).toFixed(1)} min`);
	console.info(`synths         : ${exported.synths.filter((s) => !s.hidden).length} (expected 50)`);
	console.info(`topic clusters : ${exported.topics.filter((t) => !t.hidden).length} (expected 10)`);
	console.info(`source options : ${exported.sourceVisible} visible, ${exported.sourceHidden} hidden`);
	console.info(`audit          : ${JSON.stringify(exported.auditCounts)}`);
	if (timeouts > 0) {
		console.info(
			`⚠ ${timeouts} statement(s) hit the ${opts.maxWaitMs}ms settle cap — raise --max-wait-ms if the pipeline was still working`,
		);
	}
	console.info(`\nwrote ${outDir}`);
	console.info(`\nscore it:\n  node ${join(STUDY_DIR, 'score100.mjs')} ${outDir}`);
	process.exit(0);
})().catch((error) => {
	console.error('Benchmark run failed:', error);
	process.exit(1);
});
