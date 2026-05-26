/**
 * Back up a single question (+ all descendants and every collection tied to
 * the question tree) from a Firestore project into a self-contained JSON file
 * that can be restored with `scripts/restoreQuestionToProduction.ts` or fed
 * to `scripts/importQuestionToEmulator.ts` for local testing.
 *
 * SAFETY:
 *   - Refuses to run if FIRESTORE_EMULATOR_HOST is set.
 *   - Requires explicit GOOGLE_APPLICATION_CREDENTIALS pointing at a
 *     service-account JSON, OR `gcloud auth application-default login`.
 *   - Read-only — never writes to the source project's Firestore.
 *   - Refuses `--out` paths that resolve inside the git working tree (so
 *     backups never accidentally get committed). Backups MUST land in GCS
 *     or at an absolute path outside the repo.
 *
 * USAGE:
 *   gcloud auth application-default login
 *
 *   # Default: upload to gs://<project>-survey-backups/survey-<id>/<timestamp>.json
 *   GCLOUD_PROJECT=<prod-project-id> \
 *     npx tsx scripts/exportProdQuestion.ts --question-id <statementId>
 *
 *   # Or upload to a specific GCS object
 *   GCLOUD_PROJECT=<prod> npx tsx scripts/exportProdQuestion.ts \
 *     --question-id <id> --out gs://my-bucket/path/file.json
 *
 *   # Or write to an absolute local path OUTSIDE this repo (emergency only)
 *   GCLOUD_PROJECT=<prod> npx tsx scripts/exportProdQuestion.ts \
 *     --question-id <id> --out /Users/tal/backups/survey.json
 *
 *   Optional flags:
 *     --max-depth <n>       Stop walking after n levels (default: unlimited)
 *     --bucket <name>       Override default GCS bucket name
 *     --no-evaluations      Skip evaluation export
 *     --no-subscriptions    Skip subscription export
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Storage } from '@google-cloud/storage';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve, isAbsolute, relative } from 'path';
import { execSync } from 'child_process';

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
const outArg = getArg('--out');
const bucketOverride = getArg('--bucket');
const maxDepth = Number(getArg('--max-depth') ?? Number.POSITIVE_INFINITY);
const skipEvaluations = hasFlag('--no-evaluations');
const skipSubscriptions = hasFlag('--no-subscriptions');

if (!questionId) {
	console.error(
		'Usage: --question-id <id> [--out <gs://...|absolute-path>] [--bucket <name>] [--max-depth <n>] [--no-evaluations] [--no-subscriptions]',
	);
	process.exit(1);
}

// ----------------------------------------------------------------------
// Output destination resolution
// ----------------------------------------------------------------------
function getRepoRoot(): string | null {
	try {
		return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
	} catch {
		return null;
	}
}

function ensureNotInsideRepo(absPath: string): void {
	const root = getRepoRoot();
	if (!root) return;
	const rel = relative(root, absPath);
	if (!rel.startsWith('..') && !isAbsolute(rel)) {
		console.error(
			`Refusing to write backup inside the git working tree (${root}). ` +
				`Backups contain PII and must not be committable. ` +
				`Use a gs:// URL or an absolute path outside the repo.`,
		);
		process.exit(1);
	}
}

interface Destination {
	kind: 'gcs' | 'local';
	gcsBucket?: string;
	gcsObject?: string;
	localPath?: string;
	display: string;
}

function resolveDestination(): Destination {
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

	if (outArg && outArg.startsWith('gs://')) {
		const stripped = outArg.replace(/^gs:\/\//, '');
		const slash = stripped.indexOf('/');
		if (slash === -1) {
			console.error('Invalid gs:// URL — expected gs://<bucket>/<object-path>');
			process.exit(1);
		}
		return {
			kind: 'gcs',
			gcsBucket: stripped.slice(0, slash),
			gcsObject: stripped.slice(slash + 1),
			display: outArg,
		};
	}

	if (outArg) {
		if (!isAbsolute(outArg)) {
			console.error(
				`--out must be a gs:// URL or an ABSOLUTE local path. ` +
					`Relative paths are rejected to prevent accidental in-repo writes.`,
			);
			process.exit(1);
		}
		const abs = resolve(outArg);
		ensureNotInsideRepo(abs);
		return { kind: 'local', localPath: abs, display: abs };
	}

	const bucket = bucketOverride ?? `${projectId}-survey-backups`;
	const object = `survey-${questionId}/${stamp}.json`;
	return {
		kind: 'gcs',
		gcsBucket: bucket,
		gcsObject: object,
		display: `gs://${bucket}/${object}`,
	};
}

// ----------------------------------------------------------------------
// Init admin SDK
// ----------------------------------------------------------------------
if (getApps().length === 0) {
	initializeApp({ projectId });
}
const db = getFirestore();

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------
type Doc = Record<string, unknown>;

async function fetchByFieldIn(
	collection: string,
	field: string,
	values: string[],
	idField: string,
): Promise<Doc[]> {
	const results: Doc[] = [];
	if (values.length === 0) return results;
	for (let i = 0; i < values.length; i += 30) {
		const slice = values.slice(i, i + 30);
		const snap = await db.collection(collection).where(field, 'in', slice).get();
		snap.forEach((doc) => {
			results.push({ ...(doc.data() as Doc), [idField]: doc.id });
		});
	}
	return results;
}

async function fetchByFieldEquals(
	collection: string,
	field: string,
	value: string,
	idField: string,
): Promise<Doc[]> {
	const results: Doc[] = [];
	const snap = await db.collection(collection).where(field, '==', value).get();
	snap.forEach((doc) => {
		results.push({ ...(doc.data() as Doc), [idField]: doc.id });
	});
	return results;
}

async function fetchDocsByIds(
	collection: string,
	ids: string[],
	idField: string,
): Promise<Doc[]> {
	const results: Doc[] = [];
	if (ids.length === 0) return results;
	for (let i = 0; i < ids.length; i += 30) {
		const slice = ids.slice(i, i + 30);
		const refs = slice.map((id) => db.collection(collection).doc(id));
		const docs = await db.getAll(...refs);
		docs.forEach((doc) => {
			if (doc.exists) {
				results.push({ ...(doc.data() as Doc), [idField]: doc.id });
			}
		});
	}
	return results;
}

interface SubcollectionEntry {
	parentStatementId: string;
	docId: string;
	data: Doc;
}

async function fetchSubcollectionForStatements(
	parentIds: string[],
	subcollectionName: string,
): Promise<SubcollectionEntry[]> {
	const results: SubcollectionEntry[] = [];
	for (const parentStatementId of parentIds) {
		const snap = await db
			.collection('statements')
			.doc(parentStatementId)
			.collection(subcollectionName)
			.get();
		snap.forEach((doc) => {
			results.push({ parentStatementId, docId: doc.id, data: doc.data() as Doc });
		});
	}
	return results;
}

// ----------------------------------------------------------------------
// Payload shape
// ----------------------------------------------------------------------
interface ExportPayload {
	meta: {
		exportVersion: 2;
		exportedAt: number;
		sourceProjectId: string;
		questionId: string;
		descendantCount: number;
		counts: Record<string, number>;
		// Back-compat with v1 importQuestionToEmulator.ts:
		statementCount: number;
		evaluationCount: number;
		subscriptionCount: number;
		clusterAggregationCount: number;
		clusterEvaluationLinkCount: number;
	};
	question: Doc | null;
	statements: Doc[];
	evaluations: Doc[];
	subscriptions: Doc[];
	clusterAggregations: Doc[];
	clusterEvaluationLinks: Doc[];
	// New in v2:
	votes: Doc[];
	agrees: Doc[];
	approval: Doc[];
	importance: Doc[];
	choseBy: Doc[];
	results: Doc[];
	suggestions: Doc[];
	userEvaluations: Doc[];
	polarizationIndex: Doc[];
	statementSnapshots: Doc[];
	userDemographicEvaluations: Doc[];
	userDemographicQuestions: Doc[];
	surveyProgress: Doc[];
	moderationLogs: Doc[];
	researchLogs: Doc[];
	massConsensusProcesses: Doc[];
	massConsensusMembers: Doc[];
	joinDelegates: Doc[];
	joinDelegateInvitations: Doc[];
	statementsSettings: Doc[];
	statementsMeta: Doc[];
	statementsPasswords: Doc[];
	evidencePosts: Doc[];
	evidenceVotes: Doc[];
	framings: Doc[];
	framingRequests: Doc[];
	framingSnapshots: Doc[];
	// Subcollections:
	statementHistory: SubcollectionEntry[];
	joinFormSubmissions: SubcollectionEntry[];
}

// ----------------------------------------------------------------------
// Main export
// ----------------------------------------------------------------------
async function exportQuestion(): Promise<ExportPayload> {
	console.info(`Reading question ${questionId} from project ${projectId}…`);

	// 1. Question doc
	const questionDoc = await db.collection('statements').doc(questionId!).get();
	if (!questionDoc.exists) {
		throw new Error(`Question ${questionId} not found in project ${projectId}`);
	}
	const question: Doc = { ...(questionDoc.data() as Doc), statementId: questionId };

	// 2. All descendants — topParentId first, BFS fallback by parentId.
	const allStatements = new Map<string, Doc>();
	allStatements.set(questionId!, question);

	console.info('Fetching descendants by topParentId…');
	const byTopParent = await db
		.collection('statements')
		.where('topParentId', '==', questionId)
		.get();
	byTopParent.forEach((doc) => {
		allStatements.set(doc.id, { ...doc.data(), statementId: doc.id });
	});

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
	const descendantIds = statements.map((s) => s.statementId as string);
	console.info(`  → ${statements.length} statements (incl. question + descendants)`);

	// 3. statementsSubscribe — admin/member links to the question
	let subscriptions: Doc[] = [];
	if (!skipSubscriptions) {
		console.info('Fetching subscriptions…');
		subscriptions = await fetchByFieldEquals('statementsSubscribe', 'statementId', questionId!, 'id');
		console.info(`  → ${subscriptions.length} subscriptions`);
	}

	// 4. evaluations — by parentId IN descendants
	let evaluations: Doc[] = [];
	if (!skipEvaluations) {
		console.info('Fetching evaluations…');
		evaluations = await fetchByFieldIn('evaluations', 'parentId', descendantIds, 'evaluationId');
		console.info(`  → ${evaluations.length} evaluations`);
	}

	// 5. Cluster artifacts (kept identical to v1 for back-compat)
	const clusterAggregations: Doc[] = [];
	const clusterEvaluationLinks: Doc[] = [];
	console.info('Fetching cluster artifacts…');
	const clusterIds = statements
		.filter((s) => s.isCluster === true)
		.map((s) => s.statementId as string);
	if (clusterIds.length > 0) {
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

	// 6. New collections (v2)
	console.info('Fetching survey collections…');

	const votes = await fetchByFieldIn('votes', 'parentId', descendantIds, 'id');
	const agrees = await fetchByFieldIn('agrees', 'statementId', descendantIds, 'agreeId');
	const approval = await fetchByFieldIn('approval', 'documentId', descendantIds, 'id');
	const importance = await fetchByFieldIn('importance', 'parentId', descendantIds, 'importanceId');
	const choseBy = await fetchDocsByIds('choseBy', descendantIds, 'statementId');
	const results = await fetchDocsByIds('results', descendantIds, 'statementId');
	const suggestions = await fetchByFieldEquals('suggestions', 'topParentId', questionId!, 'suggestionId');
	const userEvaluations = await fetchByFieldIn(
		'userEvaluations',
		'parentId',
		descendantIds,
		'id',
	);
	const polarizationIndex = await fetchByFieldIn(
		'polarizationIndex',
		'parentId',
		descendantIds,
		'id',
	);
	// statementSnapshots uses nested topic.statementId — can't `in` query a nested
	// field with 30-chunk, so fetch per-id with equality. Cheap at our scale.
	const statementSnapshots: Doc[] = [];
	for (const sid of descendantIds) {
		const snap = await db
			.collection('statementSnapshots')
			.where('topic.statementId', '==', sid)
			.get();
		snap.forEach((doc) => {
			statementSnapshots.push({ ...doc.data(), id: doc.id });
		});
	}
	const userDemographicEvaluations = await fetchByFieldIn(
		'userDemographicEvaluations',
		'statementId',
		descendantIds,
		'id',
	);
	// userDemographicQuestions: three distinct scopes need to be covered.
	//   1. `scope: 'statement'` — linked by statementId == option/descendant
	//   2. `scope: 'group'`     — linked by topParentId == questionId
	//   3. anchor-scoped        — linked by statementId == some `survey_*`
	//                              anchor id that lives in the evaluations'
	//                              `demographicAnchorId` field (NOT in the
	//                              question tree). Without this, the backup
	//                              loses the question definitions needed to
	//                              interpret the captured answers.
	// Query all three and dedupe by doc id.
	const demographicQuestionsById = new Map<string, Doc>();
	for (const d of await fetchByFieldIn(
		'userDemographicQuestions',
		'statementId',
		descendantIds,
		'userQuestionId',
	)) {
		demographicQuestionsById.set(d.userQuestionId as string, d);
	}
	for (const d of await fetchByFieldEquals(
		'userDemographicQuestions',
		'topParentId',
		questionId!,
		'userQuestionId',
	)) {
		demographicQuestionsById.set(d.userQuestionId as string, d);
	}
	const anchorIds = Array.from(
		new Set(
			userDemographicEvaluations
				.map((e) => e.demographicAnchorId)
				.filter((x): x is string => typeof x === 'string' && x.length > 0),
		),
	);
	if (anchorIds.length > 0) {
		for (const d of await fetchByFieldIn(
			'userDemographicQuestions',
			'statementId',
			anchorIds,
			'userQuestionId',
		)) {
			demographicQuestionsById.set(d.userQuestionId as string, d);
		}
	}
	const userDemographicQuestions = Array.from(demographicQuestionsById.values());
	const surveyProgress = await fetchByFieldEquals(
		'surveyProgress',
		'surveyId',
		questionId!,
		'id',
	);
	const moderationLogs = await fetchByFieldEquals(
		'moderationLogs',
		'topParentId',
		questionId!,
		'id',
	);
	const researchLogs = await fetchByFieldEquals(
		'researchLogs',
		'topParentId',
		questionId!,
		'logId',
	);
	const massConsensusProcesses = await fetchByFieldEquals(
		'massConsensusProcesses',
		'statementId',
		questionId!,
		'id',
	);
	const massConsensusMembers = await fetchByFieldEquals(
		'massConsensusMembers',
		'statementId',
		questionId!,
		'memberId',
	);
	const joinDelegates = await fetchByFieldEquals('joinDelegates', 'questionId', questionId!, 'id');
	const joinDelegateInvitations = await fetchByFieldEquals(
		'joinDelegateInvitations',
		'questionId',
		questionId!,
		'id',
	);
	const statementsSettings = await fetchDocsByIds('statementsSettings', descendantIds, 'statementId');
	const statementsMeta = await fetchDocsByIds('statementsMeta', descendantIds, 'statementId');
	const statementsPasswords = await fetchDocsByIds('statementsPasswords', descendantIds, 'statementId');
	const evidencePosts = await fetchByFieldIn('evidencePosts', 'parentId', descendantIds, 'id');
	const evidenceVotes = await fetchByFieldIn('evidenceVotes', 'parentId', descendantIds, 'id');
	const framings = await fetchByFieldIn('framings', 'topParentId', descendantIds, 'id');
	const framingRequests = await fetchByFieldIn(
		'framingRequests',
		'topParentId',
		descendantIds,
		'id',
	);
	const framingSnapshots = await fetchByFieldIn(
		'framingSnapshots',
		'topParentId',
		descendantIds,
		'id',
	);

	// 7. Subcollections — iterate over each statement
	console.info('Fetching subcollections…');
	const statementHistory = await fetchSubcollectionForStatements(descendantIds, 'statementHistory');
	const joinFormSubmissions = await fetchSubcollectionForStatements(
		[questionId!],
		'joinFormSubmissions',
	);

	const counts: Record<string, number> = {
		statements: statements.length,
		evaluations: evaluations.length,
		subscriptions: subscriptions.length,
		clusterAggregations: clusterAggregations.length,
		clusterEvaluationLinks: clusterEvaluationLinks.length,
		votes: votes.length,
		agrees: agrees.length,
		approval: approval.length,
		importance: importance.length,
		choseBy: choseBy.length,
		results: results.length,
		suggestions: suggestions.length,
		userEvaluations: userEvaluations.length,
		polarizationIndex: polarizationIndex.length,
		statementSnapshots: statementSnapshots.length,
		userDemographicEvaluations: userDemographicEvaluations.length,
		userDemographicQuestions: userDemographicQuestions.length,
		surveyProgress: surveyProgress.length,
		moderationLogs: moderationLogs.length,
		researchLogs: researchLogs.length,
		massConsensusProcesses: massConsensusProcesses.length,
		massConsensusMembers: massConsensusMembers.length,
		joinDelegates: joinDelegates.length,
		joinDelegateInvitations: joinDelegateInvitations.length,
		statementsSettings: statementsSettings.length,
		statementsMeta: statementsMeta.length,
		statementsPasswords: statementsPasswords.length,
		evidencePosts: evidencePosts.length,
		evidenceVotes: evidenceVotes.length,
		framings: framings.length,
		framingRequests: framingRequests.length,
		framingSnapshots: framingSnapshots.length,
		statementHistory: statementHistory.length,
		joinFormSubmissions: joinFormSubmissions.length,
	};

	return {
		meta: {
			exportVersion: 2,
			exportedAt: Date.now(),
			sourceProjectId: projectId!,
			questionId: questionId!,
			descendantCount: statements.length - 1,
			counts,
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
		votes,
		agrees,
		approval,
		importance,
		choseBy,
		results,
		suggestions,
		userEvaluations,
		polarizationIndex,
		statementSnapshots,
		userDemographicEvaluations,
		userDemographicQuestions,
		surveyProgress,
		moderationLogs,
		researchLogs,
		massConsensusProcesses,
		massConsensusMembers,
		joinDelegates,
		joinDelegateInvitations,
		statementsSettings,
		statementsMeta,
		statementsPasswords,
		evidencePosts,
		evidenceVotes,
		framings,
		framingRequests,
		framingSnapshots,
		statementHistory,
		joinFormSubmissions,
	};
}

// ----------------------------------------------------------------------
// Writers
// ----------------------------------------------------------------------
async function writePayload(payload: ExportPayload, dest: Destination): Promise<void> {
	const body = JSON.stringify(payload, null, 2);
	if (dest.kind === 'gcs') {
		const storage = new Storage({ projectId });
		const bucket = storage.bucket(dest.gcsBucket!);
		const [exists] = await bucket.exists();
		if (!exists) {
			throw new Error(
				`GCS bucket gs://${dest.gcsBucket} does not exist. Create it first:\n` +
					`  gsutil mb -p ${projectId} -l me-west1 -b on gs://${dest.gcsBucket}\n` +
					`  gsutil versioning set on gs://${dest.gcsBucket}\n` +
					`  gsutil uniformbucketlevelaccess set on gs://${dest.gcsBucket}`,
			);
		}
		await bucket.file(dest.gcsObject!).save(Buffer.from(body, 'utf-8'), {
			contentType: 'application/json',
			metadata: { cacheControl: 'no-store' },
		});
		return;
	}
	mkdirSync(dirname(dest.localPath!), { recursive: true });
	writeFileSync(dest.localPath!, body, 'utf-8');
}

// ----------------------------------------------------------------------
// Entry
// ----------------------------------------------------------------------
(async () => {
	try {
		const dest = resolveDestination();
		const payload = await exportQuestion();
		await writePayload(payload, dest);

		console.info(`\n✓ Wrote ${dest.display}`);
		console.info('  Collection counts:');
		const rows = Object.entries(payload.meta.counts)
			.filter(([, n]) => n > 0)
			.sort(([, a], [, b]) => b - a);
		for (const [name, n] of rows) {
			console.info(`    ${name.padEnd(32)} ${n}`);
		}
		const zeros = Object.entries(payload.meta.counts).filter(([, n]) => n === 0);
		if (zeros.length > 0) {
			console.info(`  (empty: ${zeros.map(([n]) => n).join(', ')})`);
		}
	} catch (error) {
		console.error('Export failed:', error);
		process.exit(1);
	}
})();
