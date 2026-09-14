/**
 * Backfill `topParentId` (and a missing `embeddingModel` stamp) on
 * `statementEmbeddings` docs, so tree-scoped statement search can find them.
 *
 * Why: search filters vectors by `topParentId` AND `embeddingModel` (vectors
 * from different models cannot be compared; see vector-search-service
 * findSimilarInTree). New embedding docs get both on write; older docs lack
 * `topParentId`, and the oldest lack the model stamp — those were all written
 * before per-question models existed, so they carry the global default model.
 *
 * Per embedding doc missing either field: read its statement, set
 * `topParentId` from it (falling back to the parent, or itself when top-level)
 * and stamp the default model if absent. Never overwrites an existing value,
 * never touches `lastUpdate`. Idempotent; resumable with --start-after.
 *
 * USAGE (from functions/):
 *   Dry run (default — counts only, no writes):
 *     GCLOUD_PROJECT=<project> npx tsx scripts/backfillEmbeddingTopParentId.ts
 *   Apply:
 *     GCLOUD_PROJECT=<project> npx tsx scripts/backfillEmbeddingTopParentId.ts --execute --confirm-project=<project>
 *   Resume after a crash:
 *     ... --start-after <embeddingDocId>
 *   Emulator (FIRESTORE_EMULATOR_HOST set) needs no --confirm-project.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type DocumentData, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { DEFAULT_EMBEDDING_MODEL } from '../src/services/embedding-model-resolver';

const PAGE = 300;
const BATCH_LIMIT = 400;

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const project = process.env.GCLOUD_PROJECT;
const onEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const confirmArg = args.find((arg) => arg.startsWith('--confirm-project='));
const startAfterIndex = args.indexOf('--start-after');
const startAfter = startAfterIndex >= 0 ? args[startAfterIndex + 1] : undefined;

if (!project) {
	console.error(
		'Usage: GCLOUD_PROJECT=<project> npx tsx scripts/backfillEmbeddingTopParentId.ts [--execute --confirm-project=<project>] [--start-after <id>]',
	);
	process.exit(1);
}
if (EXECUTE && !onEmulator && confirmArg !== `--confirm-project=${project}`) {
	console.error(`Refusing to write to ${project} without --confirm-project=${project}`);
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });

const db = getFirestore();

interface Stats {
	scanned: number;
	complete: number;
	updated: number;
	orphans: number;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function resolveTopParentId(statementId: string, statement: DocumentData): string {
	if (isNonEmptyString(statement.topParentId)) return statement.topParentId;
	const parentId = statement.parentId;

	return !isNonEmptyString(parentId) || parentId === 'top' ? statementId : parentId;
}

async function processPage(docs: QueryDocumentSnapshot[], stats: Stats): Promise<void> {
	const pending = docs.filter((doc) => {
		const data = doc.data();

		return !isNonEmptyString(data.topParentId) || !isNonEmptyString(data.embeddingModel);
	});
	stats.scanned += docs.length;
	stats.complete += docs.length - pending.length;
	if (pending.length === 0) return;

	const statementSnaps = await db.getAll(
		...pending.map((doc) => db.collection(Collections.statements).doc(doc.id)),
	);

	let batch = db.batch();
	let inBatch = 0;
	for (let i = 0; i < pending.length; i++) {
		const embeddingDoc = pending[i];
		const statement = statementSnaps[i].data();
		if (!statementSnaps[i].exists || !statement) {
			stats.orphans += 1;
			continue;
		}

		const current = embeddingDoc.data();
		const update: Record<string, string> = {};
		if (!isNonEmptyString(current.topParentId)) {
			update.topParentId = resolveTopParentId(embeddingDoc.id, statement);
		}
		if (!isNonEmptyString(current.embeddingModel)) {
			update.embeddingModel = DEFAULT_EMBEDDING_MODEL;
		}

		stats.updated += 1;
		if (!EXECUTE) continue;

		batch.update(embeddingDoc.ref, update);
		inBatch += 1;
		if (inBatch >= BATCH_LIMIT) {
			await batch.commit();
			batch = db.batch();
			inBatch = 0;
		}
	}
	if (EXECUTE && inBatch > 0) await batch.commit();
}

async function main(): Promise<void> {
	const stats: Stats = { scanned: 0, complete: 0, updated: 0, orphans: 0 };
	let cursor = startAfter;
	console.info(
		`${EXECUTE ? 'EXECUTE' : 'DRY RUN'} on ${project}${onEmulator ? ' (emulator)' : ''}` +
			(cursor ? `, starting after ${cursor}` : ''),
	);

	for (;;) {
		let query = db
			.collection(Collections.statementEmbeddings)
			.select('topParentId', 'embeddingModel')
			.orderBy('__name__')
			.limit(PAGE);
		if (cursor) query = query.startAfter(cursor);

		const snapshot = await query.get();
		if (snapshot.empty) break;

		await processPage(snapshot.docs, stats);
		cursor = snapshot.docs[snapshot.docs.length - 1].id;
		console.info(
			`scanned ${stats.scanned} · complete ${stats.complete} · ${EXECUTE ? 'updated' : 'would update'} ${stats.updated} · orphans ${stats.orphans} · last ${cursor}`,
		);
		if (snapshot.docs.length < PAGE) break;
	}

	console.info('Done.', stats);
}

main().catch((error: unknown) => {
	console.error('backfillEmbeddingTopParentId failed', error);
	process.exit(1);
});
