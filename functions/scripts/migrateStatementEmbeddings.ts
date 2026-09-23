/**
 * Move vectors off statement docs into `statementEmbeddings/{statementId}`.
 *
 * Every client listening to a statement downloads the whole doc on every
 * change, and the 1536-float `embedding` (plus `hybridEmbedding`) made that
 * ~57 KB — the main cause of the mind map lagging seconds behind taps on
 * phones. Functions now read and write the new collection (with a fallback to
 * the old fields); this script moves what is already stored.
 *
 * Per statement that still carries any legacy field: copy the fields to its
 * embedding doc (never overwriting a vector the new code already wrote there),
 * then delete them from the statement doc. Idempotent — re-running skips
 * migrated docs. It does not touch `lastUpdate`, so delta listeners ignore it;
 * the statement update triggers ignore embedding-only changes.
 *
 * USAGE (from functions/):
 *   Dry run (default — counts only, no writes):
 *     GCLOUD_PROJECT=<project> npx tsx scripts/migrateStatementEmbeddings.ts
 *   One question's children first:
 *     ... --question <questionId> --apply --confirm-project=<project>
 *   Everything (resumable with --start-after <statementId> from the log):
 *     ... --apply --confirm-project=<project>
 *   Emulator (FIRESTORE_EMULATOR_HOST set) needs no --confirm-project.
 *
 * After a full run reports 0 remaining: set EMBEDDING_LEGACY_FALLBACK=off for
 * functions (stops the second vector query per search).
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { FieldPath, getFirestore, type Query } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import {
	LEGACY_EMBEDDING_FIELDS,
	embeddingDocRef,
	hasLegacyEmbeddingFields,
	legacyFieldDeletes,
	legacyFieldsForEmbeddingDoc,
	loadEmbeddingDocs,
} from '../src/services/statement-embedding-store';

/** Two writes per doc and up to ~12 KB of vectors each: well inside one batch. */
const PAGE_SIZE = 100;
/** Breathing room between pages for the (no-op) statement update triggers. */
const PAUSE_MS = 250;

/** Fields that describe one stored vector and must not be mixed across copies. */
const TEXT_VECTOR_FIELDS = [
	'embedding',
	'embeddingModel',
	'embeddingContext',
	'embeddingCreatedAt',
	'embeddingBrief',
	'textHash',
];
const HYBRID_VECTOR_FIELDS = [
	'hybridEmbedding',
	'hybridEmbeddingStale',
	'hybridEmbeddingUpdatedAt',
];

function arg(name: string): string | undefined {
	const prefix = `--${name}=`;
	const inline = process.argv.find((a) => a.startsWith(prefix));
	if (inline) return inline.slice(prefix.length);
	const index = process.argv.indexOf(`--${name}`);

	return index >= 0 ? process.argv[index + 1] : undefined;
}

const apply = process.argv.includes('--apply');
const questionId = arg('question');
const startAfter = arg('start-after');
const project = process.env.GCLOUD_PROJECT;
const onEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if (!project) {
	console.error('Set GCLOUD_PROJECT (e.g. freedi-test or wizcol-app).');
	process.exit(1);
}
if (apply && !onEmulator && arg('confirm-project') !== project) {
	console.error(`Writing to ${project}: pass --confirm-project=${project} to confirm.`);
	process.exit(1);
}

if (getApps().length === 0) initializeApp({ projectId: project });
const db = getFirestore();

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
	console.info(
		`${apply ? 'APPLY' : 'DRY RUN'} on ${project}${onEmulator ? ' (emulator)' : ''}` +
			(questionId ? `, children of ${questionId}` : ', all statements'),
	);

	let base: Query = db.collection(Collections.statements);
	if (questionId) base = base.where('parentId', '==', questionId);
	base = base.orderBy(FieldPath.documentId()).select('parentId', ...LEGACY_EMBEDDING_FIELDS);

	let cursor = startAfter;
	let scanned = 0;
	let withLegacy = 0;
	let moved = 0;

	for (;;) {
		const page = await (cursor ? base.startAfter(cursor) : base).limit(PAGE_SIZE).get();
		if (page.empty) break;
		scanned += page.size;
		cursor = page.docs[page.docs.length - 1].id;

		const legacyDocs = page.docs.filter((doc) => hasLegacyEmbeddingFields(doc.data()));
		withLegacy += legacyDocs.length;

		if (apply && legacyDocs.length > 0) {
			const existing = await loadEmbeddingDocs(legacyDocs.map((doc) => doc.id));
			const batch = db.batch();

			for (const doc of legacyDocs) {
				const data = doc.data();
				const current = existing.get(doc.id) ?? {};
				// A vector the new code wrote since the deploy is newer than the one
				// on the statement: keep it and everything describing it.
				const skip = new Set<string>([
					...(current.embedding !== undefined ? TEXT_VECTOR_FIELDS : []),
					...(current.hybridEmbedding !== undefined ? HYBRID_VECTOR_FIELDS : []),
				]);
				const toCopy = Object.fromEntries(
					Object.entries(legacyFieldsForEmbeddingDoc(data)).filter(([field]) => !skip.has(field)),
				);
				batch.set(
					embeddingDocRef(doc.id),
					{
						...toCopy,
						statementId: doc.id,
						parentId: data.parentId ?? current.parentId ?? '',
						lastUpdate: Date.now(),
					},
					{ merge: true },
				);
				batch.update(doc.ref, legacyFieldDeletes());
			}

			await batch.commit();
			moved += legacyDocs.length;
			await sleep(PAUSE_MS);
		}

		console.info(
			`scanned ${scanned} · with legacy fields ${withLegacy} · moved ${moved} · last ${cursor}`,
		);
	}

	console.info(
		apply
			? `Done. Moved ${moved} statements' vectors. Re-run without --apply to confirm 0 remain.`
			: `Dry run: ${withLegacy} of ${scanned} statements still carry legacy vector fields.`,
	);
}

main().catch((error) => {
	console.error('Migration failed:', error);
	process.exit(1);
});
