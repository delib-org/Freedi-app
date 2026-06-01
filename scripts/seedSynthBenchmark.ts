/**
 * Synth-vs-Cluster pipeline benchmark seeder.
 *
 * Given a JSON benchmark file describing a question and a corpus organized as
 *   2 topics × 2 synths × 10 paraphrases = 40 options,
 * this script writes the 40 options under the question and lets the live-synth
 * pipeline build the clusters from scratch.
 *
 * Expected outcome (success criteria for the benchmark):
 *   - 2 derivedByPipeline='topic-cluster' statements parented to the question
 *   - 4 derivedByPipeline='synthesis' statements (2 inside each topic-cluster)
 *   - Each synth integrates ~10 source options (its `integratedOptions` array)
 *   - 40 source options remain (some auto-hidden as they get absorbed)
 *
 * USAGE
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 \
 *   GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/seedSynthBenchmark.ts path/to/benchmark.json
 *
 *   # Optional env vars:
 *   #   SEED_USER_UID  — emulator auth uid for the creator (defaults below)
 *   #   SEED_DELAY_MS  — ms between option writes (default 2000)
 *   #   SEED_FINAL_WAIT_MS — ms to wait after writes before tallying (default 60000)
 *
 * BENCHMARK FILE FORMAT (JSON):
 *   {
 *     "questionId": "abc123",
 *     "questionText": "What should our city do to improve quality of life?",
 *     "topics": [
 *       {
 *         "name": "education",
 *         "synths": [
 *           { "name": "teacher-pay", "paraphrases": ["...", "..."] },  // 10 items
 *           { "name": "modernize-buildings", "paraphrases": ["...", "..."] } // 10 items
 *         ]
 *       },
 *       {
 *         "name": "transportation",
 *         "synths": [
 *           { "name": "expand-bus", "paraphrases": [...] },           // 10 items
 *           { "name": "bike-lanes", "paraphrases": [...] }            // 10 items
 *         ]
 *       }
 *     ]
 *   }
 */

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error(
		'Refusing to run without FIRESTORE_EMULATOR_HOST set. This script is emulator-only.',
	);
	process.exit(1);
}

const benchmarkPath = process.argv[2];
if (!benchmarkPath) {
	console.error('Usage: npx tsx scripts/seedSynthBenchmark.ts <benchmark.json>');
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
interface BenchmarkFile {
	questionId: string;
	questionText: string;
	topics: TopicGroup[];
}

const raw = readFileSync(resolvePath(benchmarkPath), 'utf-8');
const benchmark: BenchmarkFile = JSON.parse(raw);

// Structural sanity check — the benchmark expects a very specific shape.
if (benchmark.topics.length !== 2) {
	console.error(`Expected 2 topics, got ${benchmark.topics.length}`);
	process.exit(1);
}
for (const topic of benchmark.topics) {
	if (topic.synths.length !== 2) {
		console.error(`Topic "${topic.name}" must have 2 synths, got ${topic.synths.length}`);
		process.exit(1);
	}
	for (const synth of topic.synths) {
		if (synth.paraphrases.length !== 10) {
			console.error(
				`Synth "${topic.name}/${synth.name}" must have 10 paraphrases, got ${synth.paraphrases.length}`,
			);
			process.exit(1);
		}
	}
}

if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}
const db = getFirestore();

const QUESTION_ID = benchmark.questionId;
const QUESTION_TEXT = benchmark.questionText;
const USER_UID = process.env.SEED_USER_UID ?? 'dDKeLPe8IC6EOttQ5Ih6Y9ZXcXfY';
const USER_NAME = 'Synth Benchmark Seeder';
const USER_EMAIL = 'synth.benchmark@example.com';
const DELAY_MS = Number(process.env.SEED_DELAY_MS ?? 12000);
const FINAL_WAIT_MS = Number(process.env.SEED_FINAL_WAIT_MS ?? 120000);
const ORDERING = (process.env.SEED_ORDERING ?? 'sequential') as 'sequential' | 'interleave';

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function createBlankEvaluation() {
	return {
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
	};
}

/**
 * Ensure the benchmark question exists and has synthesis enabled. If the
 * question is missing, create it as a regular question (not MC) and flip the
 * explicit `statementSettings.synthesis.enabled = true` flag so live-synth
 * runs regardless of the default-OFF policy for non-MC questions.
 */
async function ensureQuestion(): Promise<void> {
	const ref = db.collection('statements').doc(QUESTION_ID);
	const snap = await ref.get();
	const now = Date.now();

	if (snap.exists) {
		console.info(`✓ Question ${QUESTION_ID} exists — enabling synthesis settings`);
		await ref.set(
			{
				statementSettings: {
					synthesis: { enabled: true },
					liveSynthEnabled: true, // legacy fallback
				},
				lastUpdate: now,
			},
			{ merge: true },
		);

		return;
	}

	console.info(`+ Creating question ${QUESTION_ID}`);
	await ref.set({
		statementId: QUESTION_ID,
		statement: QUESTION_TEXT,
		paragraphs: [],
		statementType: 'question',
		parentId: 'top',
		parents: [],
		topParentId: QUESTION_ID,
		creatorId: USER_UID,
		creator: {
			uid: USER_UID,
			displayName: USER_NAME,
			email: USER_EMAIL,
			photoURL: null,
			isAnonymous: false,
			defaultLanguage: 'en',
		},
		createdAt: now,
		lastUpdate: now,
		lastChildUpdate: now,
		consensus: 0,
		totalEvaluators: 0,
		hide: false,
		randomSeed: Math.random(),
		evaluation: createBlankEvaluation(),
		// Public access so the seeded question resolves authorization and renders
		// in the normal UI without a manual Firestore patch. useAuthorization stays
		// in a permanent loading state when neither the statement nor its top parent
		// carry membership.access (see src/controllers/hooks/useAuthorization.ts).
		membership: { access: 'public' },
		statementSettings: {
			enableAddVotingOption: true,
			enableAddEvaluationOption: true,
			enableNotifications: false,
			synthesis: { enabled: true },
			liveSynthEnabled: true,
		},
	});
}

interface CreatedOption {
	statementId: string;
	statement: string;
	topicName: string;
	synthName: string;
}

/**
 * Write the 40 options one-by-one, interleaving topics/synths so the live
 * pipeline sees representative pairs early rather than 10 near-duplicates
 * in a row. This better exercises spawn vs attach logic.
 */
async function createOptions(): Promise<CreatedOption[]> {
	const flat: CreatedOption[] = [];
	// Two orderings supported via SEED_ORDERING:
	// - sequential (default): all 10 paraphrases of synth A1, then A2, then B1, then B2.
	//   Each new paraphrase finds its same-synth predecessors at high cosine, so the
	//   pipeline can attach reliably. Then when synth A2's first arrives, it finds
	//   synth A1 at medium cosine, which is the topic-cluster spawn signal.
	// - interleave: round-robin across all four synths. Useful for stress-testing
	//   the spawn logic but harder for the pipeline to converge.
	const ordered: CreatedOption[] = [];
	if (ORDERING === 'interleave') {
		for (let i = 0; i < 10; i++) {
			for (const topic of benchmark.topics) {
				for (const synth of topic.synths) {
					ordered.push({
						statementId: '',
						statement: synth.paraphrases[i],
						topicName: topic.name,
						synthName: synth.name,
					});
				}
			}
		}
	} else {
		for (const topic of benchmark.topics) {
			for (const synth of topic.synths) {
				for (const text of synth.paraphrases) {
					ordered.push({
						statementId: '',
						statement: text,
						topicName: topic.name,
						synthName: synth.name,
					});
				}
			}
		}
	}

	console.info(
		`\nWriting ${ordered.length} options (ordering=${ORDERING}, delay=${DELAY_MS}ms between writes)…`,
	);

	for (let i = 0; i < ordered.length; i++) {
		const item = ordered[i];
		const statementId = db.collection('statements').doc().id;
		item.statementId = statementId;
		const now = Date.now();
		await db
			.collection('statements')
			.doc(statementId)
			.set({
				statementId,
				statement: item.statement,
				paragraphs: [],
				statementType: 'option',
				parentId: QUESTION_ID,
				parents: [QUESTION_ID],
				topParentId: QUESTION_ID,
				creatorId: USER_UID,
				creator: {
					uid: USER_UID,
					displayName: USER_NAME,
					email: USER_EMAIL,
					photoURL: null,
					isAnonymous: false,
					defaultLanguage: 'en',
				},
				createdAt: now,
				lastUpdate: now,
				consensus: 0,
				totalEvaluators: 0,
				hide: false,
				randomSeed: Math.random(),
				evaluation: createBlankEvaluation(),
			});
		flat.push(item);
		process.stdout.write(
			`  [${(i + 1).toString().padStart(2, ' ')}/${ordered.length}] ${item.topicName}/${item.synthName}: ${item.statement.slice(0, 60)}…\n`,
		);
		if (i + 1 < ordered.length) await sleep(DELAY_MS);
	}

	return flat;
}

interface PipelineResult {
	topicClusters: number;
	synths: number;
	visibleSourceOptions: number;
	hiddenSourceOptions: number;
	clusterDetails: Array<{
		statementId: string;
		statement: string;
		derivedByPipeline: string;
		integratedOptionsCount: number;
	}>;
}

async function tallyResults(): Promise<PipelineResult> {
	const snap = await db.collection('statements').where('parentId', '==', QUESTION_ID).get();

	let topicClusters = 0;
	let synths = 0;
	let visibleSourceOptions = 0;
	let hiddenSourceOptions = 0;
	const clusterDetails: PipelineResult['clusterDetails'] = [];

	for (const doc of snap.docs) {
		const d = doc.data();
		const derivedBy = d.derivedByPipeline as string | undefined;
		if (derivedBy === 'topic-cluster') {
			topicClusters++;
			clusterDetails.push({
				statementId: d.statementId,
				statement: d.statement,
				derivedByPipeline: derivedBy,
				integratedOptionsCount: Array.isArray(d.integratedOptions)
					? d.integratedOptions.length
					: 0,
			});
		} else if (derivedBy === 'synthesis') {
			synths++;
			clusterDetails.push({
				statementId: d.statementId,
				statement: d.statement,
				derivedByPipeline: derivedBy,
				integratedOptionsCount: Array.isArray(d.integratedOptions)
					? d.integratedOptions.length
					: 0,
			});
		} else if (d.statementType === 'option') {
			if (d.hide) hiddenSourceOptions++;
			else visibleSourceOptions++;
		}
	}

	return { topicClusters, synths, visibleSourceOptions, hiddenSourceOptions, clusterDetails };
}

function printSummary(result: PipelineResult): void {
	console.info('\n========== BENCHMARK RESULT ==========');
	console.info(`Topic clusters : ${result.topicClusters}   (expected: 2)`);
	console.info(`Synths         : ${result.synths}   (expected: 4)`);
	console.info(`Hidden options : ${result.hiddenSourceOptions}   (≈40 if fully absorbed)`);
	console.info(`Visible options: ${result.visibleSourceOptions}`);
	console.info('\n--- cluster/synth contents ---');
	for (const c of result.clusterDetails) {
		console.info(`  [${c.derivedByPipeline}] (${c.integratedOptionsCount}) ${c.statement.slice(0, 80)}`);
	}

	const pass = result.topicClusters === 2 && result.synths === 4;
	console.info(
		`\n${pass ? '✅ PASS' : '⚠️ INCOMPLETE'} — ${pass ? 'pipeline produced expected shape' : 'shape differs from benchmark; check _liveSynthAuditLog'}`,
	);
}

(async () => {
	const t0 = Date.now();
	await ensureQuestion();
	const options = await createOptions();
	console.info(`\n✓ Wrote ${options.length} options in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
	console.info(`Waiting ${FINAL_WAIT_MS / 1000}s for the pipeline to settle…`);
	await sleep(FINAL_WAIT_MS);

	const result = await tallyResults();
	printSummary(result);

	console.info('\nInspect the run:');
	console.info(
		`  - Open http://localhost:5173/statement/${QUESTION_ID}`,
	);
	console.info(
		`  - Audit log:    db.collection('_liveSynthAuditLog').where('parentId','==','${QUESTION_ID}')`,
	);
	console.info(
		`  - Gray queue:   db.collection('_liveSynthCandidates').where('parentId','==','${QUESTION_ID}')`,
	);
})().catch((e) => {
	console.error('Benchmark seeder failed:', e);
	process.exit(1);
});
