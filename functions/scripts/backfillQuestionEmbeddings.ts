/**
 * Backfill `questionEmbeddings/{statementId}` for every existing question, so
 * admin "search by meaning" (searchQuestionsByMeaning) can find questions
 * created before question vectors existed. New questions are embedded by the
 * creation trigger; edits by the update trigger.
 *
 * Pages through `statements` where statementType == 'question' (document-id
 * order) and, per question, writes the vector only when it is missing or its
 * text / model changed; drifted scope fields (creator, tree, parents, hide)
 * are refreshed without re-embedding. Idempotent: a second run embeds nothing.
 * Resumable with --start-after.
 *
 * USAGE (from functions/):
 *   Dry run (default — counts only, no writes, no OpenAI calls):
 *     GCLOUD_PROJECT=<project> npx tsx scripts/backfillQuestionEmbeddings.ts [--dry-run] [--limit 100]
 *   Apply (needs OPENAI_API_KEY):
 *     GCLOUD_PROJECT=<project> OPENAI_API_KEY=... npx tsx scripts/backfillQuestionEmbeddings.ts --execute --confirm-project=<project> [--limit 100]
 *   Resume after a crash:
 *     ... --start-after <statementId>
 *   Emulator (FIRESTORE_EMULATOR_HOST set) needs no --confirm-project.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { Collections, StatementType } from '@freedi/shared-types';
import {
	toQuestionSource,
	upsertQuestionEmbedding,
	type QuestionEmbedOutcome,
} from '../src/services/question-embedding-store';

const PAGE = 200;
/** Questions embedded at once (OpenAI rate limits). */
const CONCURRENCY = 5;

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute') && !args.includes('--dry-run');
const project = process.env.GCLOUD_PROJECT;
const onEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const confirmArg = args.find((arg) => arg.startsWith('--confirm-project='));

function argValue(flag: string): string | undefined {
	const index = args.indexOf(flag);

	return index >= 0 ? args[index + 1] : undefined;
}

const startAfter = argValue('--start-after');
const limitArg = argValue('--limit');
const LIMIT = limitArg ? Number.parseInt(limitArg, 10) : Number.POSITIVE_INFINITY;

if (!project) {
	console.error(
		'Usage: GCLOUD_PROJECT=<project> npx tsx scripts/backfillQuestionEmbeddings.ts [--dry-run | --execute --confirm-project=<project>] [--limit <n>] [--start-after <id>]',
	);
	process.exit(1);
}
if (!Number.isFinite(LIMIT) && limitArg !== undefined) {
	console.error(`--limit must be a positive number, got "${limitArg}"`);
	process.exit(1);
}
if (Number.isFinite(LIMIT) && LIMIT <= 0) {
	console.error('--limit must be a positive number');
	process.exit(1);
}
if (EXECUTE && !onEmulator && confirmArg !== `--confirm-project=${project}`) {
	console.error(`Refusing to write to ${project} without --confirm-project=${project}`);
	process.exit(1);
}
if (EXECUTE && !process.env.OPENAI_API_KEY) {
	console.error('OPENAI_API_KEY is required with --execute');
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });

const db = getFirestore();

type Stats = Record<QuestionEmbedOutcome | 'scanned' | 'notEmbeddable' | 'failed', number>;

async function processOne(doc: QueryDocumentSnapshot, stats: Stats): Promise<void> {
	const question = toQuestionSource({ statementId: doc.id, ...doc.data() });
	if (!question) {
		stats.notEmbeddable += 1;

		return;
	}
	try {
		const outcome = await upsertQuestionEmbedding(question, { dryRun: !EXECUTE });
		stats[outcome] += 1;
	} catch (error) {
		stats.failed += 1;
		console.error(
			JSON.stringify({
				operation: 'backfillQuestionEmbeddings.processOne',
				statementId: doc.id,
				message: error instanceof Error ? error.message : String(error),
			}),
		);
	}
}

async function processPage(docs: QueryDocumentSnapshot[], stats: Stats): Promise<void> {
	for (let i = 0; i < docs.length; i += CONCURRENCY) {
		await Promise.all(docs.slice(i, i + CONCURRENCY).map((doc) => processOne(doc, stats)));
	}
}

async function main(): Promise<void> {
	const stats: Stats = {
		scanned: 0,
		embedded: 0,
		synced: 0,
		unchanged: 0,
		skipped: 0,
		notEmbeddable: 0,
		failed: 0,
	};
	let cursor = startAfter;
	console.info(
		`${EXECUTE ? 'EXECUTE' : 'DRY RUN'} on ${project}${onEmulator ? ' (emulator)' : ''}` +
			(Number.isFinite(LIMIT) ? `, limit ${LIMIT}` : '') +
			(cursor ? `, starting after ${cursor}` : ''),
	);

	while (stats.scanned < LIMIT) {
		const pageSize = Math.min(PAGE, LIMIT - stats.scanned);
		let query = db
			.collection(Collections.statements)
			.where('statementType', '==', StatementType.question)
			.orderBy('__name__')
			.limit(pageSize);
		if (cursor) query = query.startAfter(cursor);

		const snapshot = await query.get();
		if (snapshot.empty) break;

		await processPage(snapshot.docs, stats);
		stats.scanned += snapshot.docs.length;
		cursor = snapshot.docs[snapshot.docs.length - 1].id;
		const verb = EXECUTE ? 'embedded' : 'would embed';
		console.info(
			`scanned ${stats.scanned} · ${verb} ${stats.embedded} · synced ${stats.synced} · unchanged ${stats.unchanged} · not embeddable ${stats.notEmbeddable + stats.skipped} · failed ${stats.failed} · last ${cursor}`,
		);
		if (snapshot.docs.length < pageSize) break;
	}

	console.info('Done.', stats);
}

main().catch((error: unknown) => {
	console.error('backfillQuestionEmbeddings failed', error);
	process.exit(1);
});
