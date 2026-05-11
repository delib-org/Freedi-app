/**
 * Export a single question (+ all descendants, evaluations, subscriptions,
 * cluster aggregations, cluster evaluation links) from a Firestore project
 * into a self-contained JSON file. Designed to feed `importQuestionToEmulator.ts`
 * for local testing of the synthesis / clustering features against real data.
 *
 * SAFETY:
 *   - Refuses to run if FIRESTORE_EMULATOR_HOST is set (so you can't pull
 *     from your emulator by accident and waste time).
 *   - Requires explicit GOOGLE_APPLICATION_CREDENTIALS pointing at a
 *     service-account JSON, OR `gcloud auth application-default login`.
 *   - Read-only — never writes to the source project.
 *
 * USAGE:
 *   gcloud auth application-default login
 *   GCLOUD_PROJECT=<prod-project-id> \
 *     npx tsx scripts/exportProdQuestion.ts \
 *       --question-id <statementId> \
 *       --out test-data/<name>.json
 *
 *   Optional flags:
 *     --max-depth <n>         Stop walking after n levels (default: unlimited)
 *     --no-evaluations        Skip evaluation export
 *     --no-subscriptions      Skip subscription export
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

// ----------------------------------------------------------------------
// Safety guards
// ----------------------------------------------------------------------
if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error(
		'Refusing to run with FIRESTORE_EMULATOR_HOST set. This script reads from a real Firestore project; unset the env var first.',
	);
	process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
	console.error(
		'Set GCLOUD_PROJECT (or GOOGLE_CLOUD_PROJECT) to the source project id, e.g. GCLOUD_PROJECT=synthesistalyaron',
	);
	process.exit(1);
}

// ----------------------------------------------------------------------
// Args
// ----------------------------------------------------------------------
function getArg(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag);
	if (idx === -1) return undefined;

	return process.argv[idx + 1];
}
function hasFlag(flag: string): boolean {
	return process.argv.includes(flag);
}

const questionId = getArg('--question-id');
const outPath = getArg('--out');
const maxDepth = Number(getArg('--max-depth') ?? Number.POSITIVE_INFINITY);
const skipEvaluations = hasFlag('--no-evaluations');
const skipSubscriptions = hasFlag('--no-subscriptions');

if (!questionId || !outPath) {
	console.error('Usage: --question-id <id> --out <file.json> [--max-depth <n>] [--no-evaluations] [--no-subscriptions]');
	process.exit(1);
}

// ----------------------------------------------------------------------
// Init admin SDK
// ----------------------------------------------------------------------
if (getApps().length === 0) {
	initializeApp({ projectId });
}
const db = getFirestore();

interface ExportPayload {
	meta: {
		exportedAt: number;
		sourceProjectId: string;
		questionId: string;
		statementCount: number;
		evaluationCount: number;
		subscriptionCount: number;
		clusterAggregationCount: number;
		clusterEvaluationLinkCount: number;
	};
	question: Record<string, unknown> | null;
	statements: Array<Record<string, unknown>>;
	evaluations: Array<Record<string, unknown>>;
	subscriptions: Array<Record<string, unknown>>;
	clusterAggregations: Array<Record<string, unknown>>;
	clusterEvaluationLinks: Array<Record<string, unknown>>;
}

async function exportQuestion(): Promise<ExportPayload> {
	console.info(`Reading question ${questionId} from project ${projectId}…`);

	// 1. Question doc
	const questionDoc = await db.collection('statements').doc(questionId!).get();
	if (!questionDoc.exists) {
		throw new Error(`Question ${questionId} not found in project ${projectId}`);
	}
	const question = { ...(questionDoc.data() as Record<string, unknown>), statementId: questionId };

	// 2. All descendants — walk by topParentId for completeness, then a
	//    BFS by parentId in case some legacy docs lack topParentId.
	const allStatements = new Map<string, Record<string, unknown>>();
	allStatements.set(questionId!, question);

	console.info('Fetching descendants by topParentId…');
	const byTopParent = await db
		.collection('statements')
		.where('topParentId', '==', questionId)
		.get();
	byTopParent.forEach((doc) => {
		allStatements.set(doc.id, { ...doc.data(), statementId: doc.id });
	});

	// BFS fallback for legacy docs missing topParentId
	console.info('BFS fallback by parentId for any orphans…');
	const queue: string[] = [questionId!];
	const visitedParents = new Set<string>();
	let depth = 0;
	while (queue.length > 0 && depth <= maxDepth) {
		const next: string[] = [];
		const batch = queue.splice(0, queue.length);
		for (const parentId of batch) {
			if (visitedParents.has(parentId)) continue;
			visitedParents.add(parentId);
			const children = await db
				.collection('statements')
				.where('parentId', '==', parentId)
				.get();
			children.forEach((doc) => {
				if (!allStatements.has(doc.id)) {
					allStatements.set(doc.id, { ...doc.data(), statementId: doc.id });
					next.push(doc.id);
				}
			});
		}
		queue.push(...next);
		depth++;
	}

	const statements = Array.from(allStatements.values());
	console.info(`  → ${statements.length} statements (incl. question + descendants)`);

	// 3. Evaluations — query in chunks since `parentId in [...]` accepts up to 30
	const evaluations: Array<Record<string, unknown>> = [];
	if (!skipEvaluations) {
		console.info('Fetching evaluations…');
		const parentIds = statements.map((s) => s.statementId as string);
		// Evaluations carry parentId = the option's parent, so we need every
		// statement id in the tree (questions + sub-questions can host options).
		for (let i = 0; i < parentIds.length; i += 30) {
			const slice = parentIds.slice(i, i + 30);
			const snap = await db
				.collection('evaluations')
				.where('parentId', 'in', slice)
				.get();
			snap.forEach((doc) => {
				evaluations.push({ ...doc.data(), evaluationId: doc.id });
			});
		}
		console.info(`  → ${evaluations.length} evaluations`);
	}

	// 4. Subscriptions — needed so we can rewire admin role locally
	const subscriptions: Array<Record<string, unknown>> = [];
	if (!skipSubscriptions) {
		console.info('Fetching subscriptions…');
		const snap = await db
			.collection('statementsSubscribe')
			.where('statementId', '==', questionId)
			.get();
		snap.forEach((doc) => {
			subscriptions.push({ ...doc.data(), id: doc.id });
		});
		console.info(`  → ${subscriptions.length} subscriptions`);
	}

	// 5. Cluster aggregations + evaluation links (preserve historical synthesis state)
	const clusterAggregations: Array<Record<string, unknown>> = [];
	const clusterEvaluationLinks: Array<Record<string, unknown>> = [];
	console.info('Fetching cluster artifacts…');
	const clusterIds = statements
		.filter((s) => s.isCluster === true)
		.map((s) => s.statementId as string);
	if (clusterIds.length > 0) {
		// clusterEvaluationLinks: indexed by clusterId
		for (let i = 0; i < clusterIds.length; i += 30) {
			const slice = clusterIds.slice(i, i + 30);
			const snap = await db
				.collection('clusterEvaluationLinks')
				.where('clusterId', 'in', slice)
				.get();
			snap.forEach((doc) => {
				clusterEvaluationLinks.push({ ...doc.data(), id: doc.id });
			});
		}
		// clusterAggregations: doc id is `${clusterId}--${framingId}`; just
		// scan and keep matches whose id starts with one of the cluster ids.
		// Cheap query for our scale.
		const aggSnap = await db.collection('clusterAggregations').get();
		const clusterIdSet = new Set(clusterIds);
		aggSnap.forEach((doc) => {
			const id = doc.id;
			const sep = id.indexOf('--');
			const cid = sep === -1 ? id : id.slice(0, sep);
			if (clusterIdSet.has(cid)) {
				clusterAggregations.push({ ...doc.data(), id });
			}
		});
	}
	console.info(
		`  → ${clusterAggregations.length} cluster aggregations, ${clusterEvaluationLinks.length} evaluation links`,
	);

	return {
		meta: {
			exportedAt: Date.now(),
			sourceProjectId: projectId!,
			questionId: questionId!,
			statementCount: statements.length,
			evaluationCount: evaluations.length,
			subscriptionCount: subscriptions.length,
			clusterAggregationCount: clusterAggregations.length,
			clusterEvaluationLinkCount: clusterEvaluationLinks.length,
		},
		question,
		statements,
		evaluations,
		subscriptions,
		clusterAggregations,
		clusterEvaluationLinks,
	};
}

(async () => {
	try {
		const payload = await exportQuestion();
		const out = resolve(outPath!);
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, JSON.stringify(payload, null, 2), 'utf-8');
		console.info(`\n✓ Wrote ${out}`);
		console.info(`  ${payload.meta.statementCount} statements, ${payload.meta.evaluationCount} evaluations`);
	} catch (error) {
		console.error('Export failed:', error);
		process.exit(1);
	}
})();
