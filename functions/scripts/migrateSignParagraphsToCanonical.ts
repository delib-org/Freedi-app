/**
 * Reversible migration: Sign official paragraphs `option` → canonical `paragraph`.
 *
 * Sign historically stored a document's official paragraphs as child statements
 * with `statementType === option` + `doc.isOfficialParagraph === true`. The
 * canonical model (shared by all apps) is `statementType === paragraph` with a
 * top-level `order` and `blockType`. This script flips the type and promotes the
 * `doc.order`/`doc.paragraphType` mirrors to the canonical top-level fields.
 *
 * What it does NOT touch:
 *  - Suggestions (they stay `option` children of the paragraph).
 *  - The `doc.*` metadata (isOfficialParagraph/order/paragraphType/images stay,
 *    so dual-read queries keep working during the transition).
 *  - `statementId` (preserved — comments/approvals/evaluations link by it).
 *
 * Reversible: every migrated doc is stamped `doc._migratedFrom = 'option'` plus
 * a snapshot of whether it had `order`/`blockType` before, so `--revert`
 * restores the exact prior shape.
 *
 * Idempotent: forward skips docs already stamped; revert skips docs not stamped.
 *
 * USAGE (from functions/):
 *   # preview (no writes):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/migrateSignParagraphsToCanonical.ts
 *   # apply:
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/migrateSignParagraphsToCanonical.ts --execute
 *   # scope to one document (by topParentId):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/migrateSignParagraphsToCanonical.ts --execute --documentId=doc_123
 *   # revert:
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/migrateSignParagraphsToCanonical.ts --execute --revert
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import {
	getFirestore,
	FieldValue,
	type Query,
	type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { StatementType, ParagraphType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';

if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('FIRESTORE_EMULATOR_HOST is set — this migration targets a real project. Aborting.');
	process.exit(1);
}

const EXECUTE = process.argv.includes('--execute');
const REVERT = process.argv.includes('--revert');
const documentId = process.argv.find((a) => a.startsWith('--documentId='))?.split('=')[1];
const limitArg = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
const LIMIT = limitArg ? parseInt(limitArg, 10) : Infinity;
const project = process.env.GCLOUD_PROJECT;

if (!project) {
	console.error('Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/migrateSignParagraphsToCanonical.ts [--execute] [--revert] [--documentId=ID] [--limit=N]');
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });

const db = getFirestore();
const PAGE = 500;

type MigratableDoc = Statement & {
	doc?: Statement['doc'] & {
		_migratedFrom?: string;
		_hadOrder?: boolean;
		_hadBlockType?: boolean;
	};
};

/** Build the page query. When scoped to a document, query by topParentId
 *  (covered by an existing index); otherwise scan the whole collection. */
function pageQuery(last: QueryDocumentSnapshot | null): Query {
	let q: Query = documentId
		? db.collection('statements').where('topParentId', '==', documentId).orderBy('__name__')
		: db.collection('statements').orderBy('__name__');
	q = q.limit(PAGE);
	if (last) q = q.startAfter(last);

	return q;
}

function isUnmigratedOfficial(d: MigratableDoc): boolean {
	return (
		d.statementType === StatementType.option &&
		d.doc?.isOfficialParagraph === true &&
		d.doc?._migratedFrom === undefined
	);
}

function isMigrated(d: MigratableDoc): boolean {
	return d.doc?._migratedFrom === 'option';
}

async function main(): Promise<void> {
	console.info(
		`\n# Sign paragraphs ${REVERT ? 'REVERT' : 'migrate option→paragraph'} — project=${project}` +
			`${documentId ? ` doc=${documentId}` : ''} ${EXECUTE ? '(EXECUTE)' : '(DRY-RUN)'}\n`,
	);

	let last: QueryDocumentSnapshot | null = null;
	let scanned = 0;
	let matched = 0;
	let written = 0;
	let batch = db.batch();
	let pending = 0;

	const flush = async (): Promise<void> => {
		if (pending === 0) return;
		if (EXECUTE) await batch.commit();
		written += pending;
		batch = db.batch();
		pending = 0;
	};

	for (;;) {
		if (matched >= LIMIT) break;
		const snap = await pageQuery(last).get();
		if (snap.empty) break;

		for (const docSnap of snap.docs) {
			scanned++;
			const d = docSnap.data() as MigratableDoc;

			if (!REVERT && isUnmigratedOfficial(d)) {
				matched++;
				const hadOrder = d.order !== undefined;
				const hadBlockType = d.blockType !== undefined;
				batch.update(docSnap.ref, {
					statementType: StatementType.paragraph,
					order: d.order ?? d.doc?.order ?? 0,
					blockType: d.blockType ?? d.doc?.paragraphType ?? ParagraphType.paragraph,
					'doc._migratedFrom': 'option',
					'doc._hadOrder': hadOrder,
					'doc._hadBlockType': hadBlockType,
					lastUpdate: Date.now(),
				});
				pending++;
			} else if (REVERT && isMigrated(d)) {
				matched++;
				const restore: Record<string, unknown> = {
					statementType: StatementType.option,
					'doc._migratedFrom': FieldValue.delete(),
					'doc._hadOrder': FieldValue.delete(),
					'doc._hadBlockType': FieldValue.delete(),
					lastUpdate: Date.now(),
				};
				if (d.doc?._hadOrder === false) restore.order = FieldValue.delete();
				if (d.doc?._hadBlockType === false) restore.blockType = FieldValue.delete();
				batch.update(docSnap.ref, restore);
				pending++;
			}

			if (pending >= 400) await flush();
			if (matched >= LIMIT) break;
		}

		last = snap.docs[snap.docs.length - 1];
		if (scanned % 5000 === 0) console.info(`  scanned ${scanned}… (matched ${matched})`);
	}
	await flush();

	console.info(
		`\nDone. scanned=${scanned} | matched=${matched} | ${EXECUTE ? `written=${written}` : 'would write=' + matched}`,
	);
	if (!EXECUTE) console.info('(DRY-RUN — nothing written. Re-run with --execute to apply.)');
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('Sign paragraph migration failed:', e);
		process.exit(1);
	});
