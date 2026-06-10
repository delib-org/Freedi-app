/**
 * Restore a question backup (produced by `exportProdQuestion.ts` v2+) into a
 * production Firestore project. Designed for disaster recovery of a single
 * survey/question and everything attached to it.
 *
 * SAFETY:
 *   - Refuses to run if FIRESTORE_EMULATOR_HOST is set (use
 *     importQuestionToEmulator.ts for the emulator).
 *   - Requires GCLOUD_PROJECT to match the target project explicitly.
 *   - Requires the env var I_UNDERSTAND_THIS_WRITES_TO_PROD=yes as a manual
 *     confirmation gate.
 *   - Default mode is a dry-run that scans for ID collisions. You must pass
 *     --execute to actually write.
 *   - If any document already exists in the target, --execute alone refuses;
 *     you must additionally pass --overwrite to acknowledge data loss risk.
 *   - Rejects v1 backups (meta.exportVersion < 2) because they don't carry
 *     enough collections for a faithful restore.
 *
 * USAGE:
 *   gcloud auth application-default login
 *
 *   # 1. Dry run — read backup, scan for collisions, report.
 *   GCLOUD_PROJECT=<prod> I_UNDERSTAND_THIS_WRITES_TO_PROD=yes \
 *     npx tsx scripts/restoreQuestionToProduction.ts \
 *       --in gs://<bucket>/survey-<id>/<timestamp>.json
 *
 *   # 2. Actually restore (no existing docs in target):
 *   ... --execute
 *
 *   # 3. Restore with overwrites (intentional):
 *   ... --execute --overwrite
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, WriteBatch } from 'firebase-admin/firestore';
import { Storage } from '@google-cloud/storage';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve, isAbsolute, relative } from 'path';
import { execSync } from 'child_process';

// ----------------------------------------------------------------------
// Safety guards
// ----------------------------------------------------------------------
if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error(
		'Refusing to run with FIRESTORE_EMULATOR_HOST set. Use importQuestionToEmulator.ts for the emulator.',
	);
	process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
	console.error('Set GCLOUD_PROJECT to the target project id (e.g. GCLOUD_PROJECT=synthesistalyaron).');
	process.exit(1);
}

if (process.env.I_UNDERSTAND_THIS_WRITES_TO_PROD !== 'yes') {
	console.error(
		`Refusing to run without explicit confirmation. ` +
			`Re-run with I_UNDERSTAND_THIS_WRITES_TO_PROD=yes in the environment ` +
			`to acknowledge this writes to project ${projectId}.`,
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

const inArg = getArg('--in');
const receiptOutArg = getArg('--receipt-out');
const doExecute = hasFlag('--execute');
const allowOverwrite = hasFlag('--overwrite');

if (!inArg) {
	console.error(
		'Usage: --in <gs://...|absolute-path> [--execute] [--overwrite] [--receipt-out <gs://...|abs-path>]',
	);
	process.exit(1);
}

// ----------------------------------------------------------------------
// Path safety: refuse paths inside the repo working tree
// ----------------------------------------------------------------------
function getRepoRoot(): string | null {
	try {
		return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
	} catch {
		return null;
	}
}
function ensureNotInsideRepo(absPath: string, label: string): void {
	const root = getRepoRoot();
	if (!root) return;
	const rel = relative(root, absPath);
	if (!rel.startsWith('..') && !isAbsolute(rel)) {
		console.error(`${label} resolves inside the git working tree (${root}). Refusing — backups must not be committable.`);
		process.exit(1);
	}
}

// ----------------------------------------------------------------------
// Init admin SDK
// ----------------------------------------------------------------------
if (getApps().length === 0) {
	initializeApp({ projectId });
}
const db = getFirestore();
const storage = new Storage({ projectId });

// ----------------------------------------------------------------------
// I/O helpers
// ----------------------------------------------------------------------
async function readBackup(input: string): Promise<string> {
	if (input.startsWith('gs://')) {
		const stripped = input.replace(/^gs:\/\//, '');
		const slash = stripped.indexOf('/');
		if (slash === -1) throw new Error('Invalid gs:// URL');
		const bucketName = stripped.slice(0, slash);
		const objectName = stripped.slice(slash + 1);
		const [buf] = await storage.bucket(bucketName).file(objectName).download();
		return buf.toString('utf-8');
	}
	if (!isAbsolute(input)) {
		console.error('--in must be a gs:// URL or an ABSOLUTE local path.');
		process.exit(1);
	}
	ensureNotInsideRepo(resolve(input), '--in');
	return readFileSync(resolve(input), 'utf-8');
}

async function writeReceipt(receipt: unknown, destination: string): Promise<string> {
	const body = JSON.stringify(receipt, null, 2);
	if (destination.startsWith('gs://')) {
		const stripped = destination.replace(/^gs:\/\//, '');
		const slash = stripped.indexOf('/');
		if (slash === -1) throw new Error('Invalid receipt gs:// URL');
		const bucketName = stripped.slice(0, slash);
		const objectName = stripped.slice(slash + 1);
		await storage
			.bucket(bucketName)
			.file(objectName)
			.save(Buffer.from(body, 'utf-8'), {
				contentType: 'application/json',
				metadata: { cacheControl: 'no-store' },
			});
		return destination;
	}
	const abs = resolve(destination);
	ensureNotInsideRepo(abs, '--receipt-out');
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf-8');
	return abs;
}

function receiptDestination(inputUri: string, ts: string): string {
	if (receiptOutArg) return receiptOutArg;
	if (inputUri.startsWith('gs://')) {
		// Same prefix as the input, sibling filename
		const lastSlash = inputUri.lastIndexOf('/');
		return `${inputUri.slice(0, lastSlash)}/restore-receipt-${ts}.json`;
	}
	const abs = resolve(inputUri);
	return `${dirname(abs)}/restore-receipt-${ts}.json`;
}

// ----------------------------------------------------------------------
// Batched writes (mirrors importQuestionToEmulator.ts)
// ----------------------------------------------------------------------
const BATCH_SIZE = Number(process.env.RESTORE_BATCH_SIZE ?? 25);
const BATCH_DELAY_MS = Number(process.env.RESTORE_BATCH_DELAY_MS ?? 250);
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

interface PendingDoc {
	ref: FirebaseFirestore.DocumentReference;
	data: Record<string, unknown>;
}

async function commitInBatches(docs: PendingDoc[], label: string): Promise<void> {
	let written = 0;
	const total = docs.length;
	for (let i = 0; i < total; i += BATCH_SIZE) {
		const slice = docs.slice(i, i + BATCH_SIZE);
		const batch: WriteBatch = db.batch();
		for (const { ref, data } of slice) batch.set(ref, data, { merge: false });
		await batch.commit();
		written += slice.length;
		process.stdout.write(`  ${label}: ${written}/${total}\r`);
		if (i + BATCH_SIZE < total) await sleep(BATCH_DELAY_MS);
	}
	process.stdout.write(`  ${label}: ${written}/${total}\n`);
}

// ----------------------------------------------------------------------
// Payload + collection spec
// ----------------------------------------------------------------------
interface SubcollectionEntry {
	parentStatementId: string;
	docId: string;
	data: Record<string, unknown>;
}

interface ExportPayload {
	meta: {
		exportVersion: number;
		exportedAt: number;
		sourceProjectId: string;
		questionId: string;
		counts?: Record<string, number>;
	};
	question: Record<string, unknown>;
	[key: string]: unknown;
}

interface CollectionSpec {
	name: string;
	idField: string; // field in each exported doc that holds the document ID
	payloadKey?: string; // top-level key in the backup JSON, if it differs from `name`
	compositeIdFallback?: (data: Record<string, unknown>) => string | undefined;
}

const COLLECTIONS: CollectionSpec[] = [
	{ name: 'statements', idField: 'statementId' },
	{
		name: 'evaluations',
		idField: 'evaluationId',
		compositeIdFallback: (d) =>
			d.evaluatorId && d.statementId ? `${d.evaluatorId}--${d.statementId}` : undefined,
	},
	{
		name: 'statementsSubscribe',
		payloadKey: 'subscriptions',
		idField: 'id',
		compositeIdFallback: (d) =>
			d.userId && d.statementId ? `${d.userId}--${d.statementId}` : undefined,
	},
	{ name: 'clusterEvaluationLinks', idField: 'id' },
	{ name: 'votes', idField: 'id' },
	{ name: 'agrees', idField: 'agreeId' },
	{ name: 'approval', idField: 'id' },
	{ name: 'importance', idField: 'importanceId' },
	{ name: 'choseBy', idField: 'statementId' },
	{ name: 'results', idField: 'statementId' },
	{ name: 'suggestions', idField: 'suggestionId' },
	{
		name: 'userEvaluations',
		idField: 'id',
		compositeIdFallback: (d) =>
			d.userId && d.parentId ? `${d.userId}--${d.parentId}` : undefined,
	},
	{ name: 'polarizationIndex', idField: 'id' },
	{ name: 'statementSnapshots', idField: 'id' },
	{
		name: 'userDemographicEvaluations',
		idField: 'id',
		compositeIdFallback: (d) =>
			d.statementId && d.userId ? `${d.statementId}--${d.userId}` : undefined,
	},
	{ name: 'userDemographicQuestions', idField: 'userQuestionId' },
	{ name: 'surveyProgress', idField: 'id' },
	{ name: 'moderationLogs', idField: 'id' },
	{ name: 'researchLogs', idField: 'logId' },
	{ name: 'massConsensusProcesses', idField: 'id' },
	{ name: 'massConsensusMembers', idField: 'memberId' },
	{ name: 'joinDelegates', idField: 'id' },
	{ name: 'joinDelegateInvitations', idField: 'id' },
	{ name: 'statementsSettings', idField: 'statementId' },
	{ name: 'statementsMeta', idField: 'statementId' },
	{ name: 'statementsPasswords', idField: 'statementId' },
	{ name: 'evidencePosts', idField: 'id' },
	{ name: 'evidenceVotes', idField: 'id' },
];

function resolveDocId(data: Record<string, unknown>, spec: CollectionSpec): string | null {
	const direct = data[spec.idField];
	if (typeof direct === 'string' && direct.length > 0) return direct;
	const composite = spec.compositeIdFallback?.(data);
	return composite ?? null;
}

// ----------------------------------------------------------------------
// Pre-flight: load + classify
// ----------------------------------------------------------------------
interface PreparedCollection {
	name: string;
	docs: PendingDoc[];
	createIds: string[];
	overwriteIds: string[];
}

interface PreparedSubcollection {
	parentCollection: 'statements';
	subName: string;
	docs: PendingDoc[];
	createPaths: string[];
	overwritePaths: string[];
}

async function classifyCollection(
	spec: CollectionSpec,
	rawDocs: Array<Record<string, unknown>>,
	importedAt: number,
): Promise<PreparedCollection> {
	const docs: PendingDoc[] = [];
	const ids: string[] = [];
	const skipped: string[] = [];

	for (const raw of rawDocs) {
		const data = { ...raw };
		const id = resolveDocId(data, spec);
		if (!id) {
			skipped.push(`<missing ${spec.idField}>`);
			continue;
		}
		// Stamp evaluations so the onCreateEvaluation trigger short-circuits
		// (same pattern as the emulator importer — statements already carry
		// aggregated state from the export, so re-aggregating is redundant).
		if (spec.name === 'evaluations' && typeof data.migratedAt !== 'number') {
			data.migratedAt = importedAt;
		}
		docs.push({ ref: db.collection(spec.name).doc(id), data });
		ids.push(id);
	}
	if (skipped.length > 0) {
		console.warn(`  ${spec.name}: ${skipped.length} doc(s) skipped (no id field)`);
	}

	// Check existence in parallel (chunked getAll)
	const existing = new Set<string>();
	for (let i = 0; i < ids.length; i += 30) {
		const slice = ids.slice(i, i + 30);
		const refs = slice.map((id) => db.collection(spec.name).doc(id));
		const snaps = await db.getAll(...refs);
		snaps.forEach((snap, idx) => {
			if (snap.exists) existing.add(slice[idx]);
		});
	}

	const createIds = ids.filter((id) => !existing.has(id));
	const overwriteIds = ids.filter((id) => existing.has(id));

	return { name: spec.name, docs, createIds, overwriteIds };
}

async function classifySubcollection(
	subName: string,
	entries: SubcollectionEntry[],
): Promise<PreparedSubcollection> {
	const docs: PendingDoc[] = [];
	const paths: string[] = [];
	for (const entry of entries) {
		const ref = db
			.collection('statements')
			.doc(entry.parentStatementId)
			.collection(subName)
			.doc(entry.docId);
		docs.push({ ref, data: entry.data });
		paths.push(`statements/${entry.parentStatementId}/${subName}/${entry.docId}`);
	}
	// Existence check
	const existing = new Set<string>();
	for (let i = 0; i < docs.length; i += 30) {
		const sliceDocs = docs.slice(i, i + 30);
		const slicePaths = paths.slice(i, i + 30);
		const snaps = await db.getAll(...sliceDocs.map((d) => d.ref));
		snaps.forEach((snap, idx) => {
			if (snap.exists) existing.add(slicePaths[idx]);
		});
	}
	const createPaths = paths.filter((p) => !existing.has(p));
	const overwritePaths = paths.filter((p) => existing.has(p));
	return { parentCollection: 'statements', subName, docs, createPaths, overwritePaths };
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------
(async () => {
	const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
	try {
		console.info(`Reading backup from ${inArg}…`);
		const raw = await readBackup(inArg!);
		const payload = JSON.parse(raw) as ExportPayload;

		if ((payload.meta?.exportVersion ?? 1) < 2) {
			console.error(
				`Backup at ${inArg} is exportVersion=${payload.meta?.exportVersion ?? 1}. ` +
					`Restore requires version >= 2 (re-export with the current scripts/exportProdQuestion.ts).`,
			);
			process.exit(1);
		}

		const questionId = payload.meta.questionId;
		console.info(`Restoring question ${questionId} into project ${projectId}`);
		console.info(`  Backup source: ${payload.meta.sourceProjectId}`);
		console.info(`  Backup taken:  ${new Date(payload.meta.exportedAt).toISOString()}`);
		console.info(`  Mode:          ${doExecute ? 'EXECUTE' : 'dry-run'}${allowOverwrite ? ' (overwrite allowed)' : ''}`);

		const importedAt = Date.now();

		// Classify every top-level collection
		const prepared: PreparedCollection[] = [];
		for (const spec of COLLECTIONS) {
			const key = spec.payloadKey ?? spec.name;
			const rawDocs = payload[key];
			if (!Array.isArray(rawDocs) || rawDocs.length === 0) continue;
			const p = await classifyCollection(spec, rawDocs as Array<Record<string, unknown>>, importedAt);
			prepared.push(p);
		}

		// Subcollections
		const subPrepared: PreparedSubcollection[] = [];
		for (const subName of ['statementHistory', 'joinFormSubmissions'] as const) {
			const entries = payload[subName];
			if (!Array.isArray(entries) || entries.length === 0) continue;
			const p = await classifySubcollection(subName, entries as SubcollectionEntry[]);
			subPrepared.push(p);
		}

		// Print plan
		console.info('\nRestore plan:');
		let totalCreates = 0;
		let totalOverwrites = 0;
		for (const p of prepared) {
			console.info(
				`  ${p.name.padEnd(32)} create=${String(p.createIds.length).padStart(5)}  overwrite=${String(p.overwriteIds.length).padStart(5)}`,
			);
			totalCreates += p.createIds.length;
			totalOverwrites += p.overwriteIds.length;
		}
		for (const sp of subPrepared) {
			console.info(
				`  ${`(sub) ${sp.subName}`.padEnd(32)} create=${String(sp.createPaths.length).padStart(5)}  overwrite=${String(sp.overwritePaths.length).padStart(5)}`,
			);
			totalCreates += sp.createPaths.length;
			totalOverwrites += sp.overwritePaths.length;
		}
		console.info(`  TOTAL                            create=${String(totalCreates).padStart(5)}  overwrite=${String(totalOverwrites).padStart(5)}`);

		if (!doExecute) {
			console.info('\nDry-run only. Re-run with --execute to apply.');
			if (totalOverwrites > 0) {
				console.info(`NOTE: ${totalOverwrites} document(s) already exist. To proceed you must also pass --overwrite.`);
			}
			return;
		}

		if (totalOverwrites > 0 && !allowOverwrite) {
			console.error(
				`\nRefusing to execute: ${totalOverwrites} document(s) already exist in ${projectId}. ` +
					`Re-run with --overwrite to acknowledge that existing data will be replaced.`,
			);
			process.exit(2);
		}

		// Write statements FIRST so other collections' triggers can resolve parents.
		const ordered = [...prepared].sort((a, b) => {
			if (a.name === 'statements') return -1;
			if (b.name === 'statements') return 1;
			return 0;
		});

		for (const p of ordered) {
			if (p.docs.length === 0) continue;
			console.info(`\nWriting ${p.name}…`);
			await commitInBatches(p.docs, p.name);
		}
		for (const sp of subPrepared) {
			if (sp.docs.length === 0) continue;
			console.info(`\nWriting ${sp.subName} (subcollection)…`);
			await commitInBatches(sp.docs, sp.subName);
		}

		// Receipt
		const receipt = {
			restoredAt: importedAt,
			finishedAt: Date.now(),
			targetProjectId: projectId,
			source: inArg,
			backupSourceProjectId: payload.meta.sourceProjectId,
			backupExportedAt: payload.meta.exportedAt,
			questionId,
			totals: { creates: totalCreates, overwrites: totalOverwrites },
			collections: prepared.map((p) => ({
				name: p.name,
				created: p.createIds.length,
				overwritten: p.overwriteIds.length,
				overwriteIds: p.overwriteIds,
			})),
			subcollections: subPrepared.map((sp) => ({
				parent: sp.parentCollection,
				name: sp.subName,
				created: sp.createPaths.length,
				overwritten: sp.overwritePaths.length,
				overwritePaths: sp.overwritePaths,
			})),
		};
		const dest = receiptDestination(inArg!, ts);
		const written = await writeReceipt(receipt, dest);
		console.info(`\n✓ Restore complete. Receipt: ${written}`);
		console.info(
			`  Verify in the app: open the survey ${questionId} and confirm options, evaluations, and consensus values match the backup.`,
		);
	} catch (error) {
		console.error('Restore failed:', error);
		process.exit(1);
	}
})();
