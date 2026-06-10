/**
 * Reversible migration: Mass-Consensus embedded `paragraphs[]` → canonical
 * paragraph child statements.
 *
 * MC historically stored a question's rich body as an embedded
 * `statement.paragraphs[]` array. The canonical model (shared by all apps) is a
 * set of child statements with `statementType === paragraph`. This script
 * creates one paragraph child per embedded entry, preserving the original
 * `paragraphId` as the child's `statementId`, `order`, `type → blockType`, and
 * list/image metadata.
 *
 * What it does NOT do:
 *  - Delete the embedded array (it stays as a deprecated, no-longer-written
 *    field for backward-compatible reads; revert deletes the created children).
 *
 * Reversible: created children are stamped `doc._migratedFrom = 'embedded'` and
 * the parent is stamped `doc._paragraphsMigrated = true`. `--revert` deletes the
 * stamped children and clears the parent flag.
 *
 * Idempotent: forward skips parents already flagged; revert skips children not
 * stamped.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/migrateMcEmbeddedParagraphsToChildren.ts
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/migrateMcEmbeddedParagraphsToChildren.ts --execute
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/migrateMcEmbeddedParagraphsToChildren.ts --execute --revert
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/migrateMcEmbeddedParagraphsToChildren.ts --execute --documentId=q_123
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import {
	getFirestore,
	FieldValue,
	type Query,
	type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { StatementType, createParagraphChildStatement } from '@freedi/shared-types';
import type { Paragraph, Statement } from '@freedi/shared-types';

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
	console.error('Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/migrateMcEmbeddedParagraphsToChildren.ts [--execute] [--revert] [--documentId=ID] [--limit=N]');
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });

const db = getFirestore();
const PAGE = 300;

type ParentDoc = Statement & { doc?: Statement['doc'] & { _paragraphsMigrated?: boolean } };

function pageQuery(last: QueryDocumentSnapshot | null): Query {
	let q: Query = documentId
		? db.collection('statements').where('__name__', '==', documentId)
		: db.collection('statements').orderBy('__name__');
	q = q.limit(PAGE);
	if (last && !documentId) q = q.startAfter(last);

	return q;
}

async function runForward(): Promise<void> {
	let last: QueryDocumentSnapshot | null = null;
	let scanned = 0;
	let parentsMigrated = 0;
	let childrenCreated = 0;

	for (;;) {
		if (parentsMigrated >= LIMIT) break;
		const snap = await pageQuery(last).get();
		if (snap.empty) break;

		for (const parentSnap of snap.docs) {
			scanned++;
			const parent = parentSnap.data() as ParentDoc;
			const paragraphs = parent.paragraphs ?? [];

			if (paragraphs.length === 0 || parent.doc?._paragraphsMigrated === true) continue;

			parentsMigrated++;
			const batch = db.batch();

			paragraphs
				.slice()
				.sort((a: Paragraph, b: Paragraph) => a.order - b.order)
				.forEach((p: Paragraph) => {
					const child = createParagraphChildStatement({
						content: p.content,
						host: {
							statementId: parent.statementId,
							topParentId: parent.topParentId || parent.statementId,
						},
						creator: parent.creator,
						creatorId: parent.creatorId,
						order: p.order,
						blockType: p.type,
						statementId: p.paragraphId,
						...(p.listType !== undefined && { listType: p.listType }),
						...(p.imageUrl !== undefined && { imageUrl: p.imageUrl }),
						...(p.imageAlt !== undefined && { imageAlt: p.imageAlt }),
						...(p.imageCaption !== undefined && { imageCaption: p.imageCaption }),
					});
					if (!child) return;
					child.doc = { ...(child.doc ?? {}), _migratedFrom: 'embedded' } as Statement['doc'];
					batch.set(db.collection('statements').doc(child.statementId), child);
					childrenCreated++;
				});

			batch.update(parentSnap.ref, {
				'doc._paragraphsMigrated': true,
				lastUpdate: Date.now(),
			});

			if (EXECUTE) await batch.commit();
			if (parentsMigrated >= LIMIT) break;
		}

		if (documentId) break;
		last = snap.docs[snap.docs.length - 1];
		if (scanned % 5000 === 0) console.info(`  scanned ${scanned}… (parents ${parentsMigrated})`);
	}

	console.info(
		`\nDone. scanned=${scanned} | parents migrated=${parentsMigrated} | children ${EXECUTE ? 'created' : 'would create'}=${childrenCreated}`,
	);
}

async function runRevert(): Promise<void> {
	let last: QueryDocumentSnapshot | null = null;
	let scanned = 0;
	let childrenDeleted = 0;
	const parentsToClear = new Set<string>();
	let batch = db.batch();
	let pending = 0;

	const flush = async (): Promise<void> => {
		if (pending === 0) return;
		if (EXECUTE) await batch.commit();
		batch = db.batch();
		pending = 0;
	};

	for (;;) {
		const snap = await pageQuery(last).get();
		if (snap.empty) break;

		for (const docSnap of snap.docs) {
			scanned++;
			const d = docSnap.data() as Statement & { doc?: { _migratedFrom?: string } };
			if (d.statementType === StatementType.paragraph && d.doc?._migratedFrom === 'embedded') {
				childrenDeleted++;
				if (d.parentId) parentsToClear.add(d.parentId);
				batch.delete(docSnap.ref);
				pending++;
				if (pending >= 400) await flush();
			}
		}

		if (documentId) break;
		last = snap.docs[snap.docs.length - 1];
		if (scanned % 5000 === 0) console.info(`  scanned ${scanned}… (children ${childrenDeleted})`);
	}
	await flush();

	// Clear the parent flags so a re-run can migrate again.
	for (const parentId of parentsToClear) {
		if (EXECUTE) {
			await db
				.collection('statements')
				.doc(parentId)
				.update({ 'doc._paragraphsMigrated': FieldValue.delete() })
				.catch(() => undefined);
		}
	}

	console.info(
		`\nRevert done. scanned=${scanned} | children ${EXECUTE ? 'deleted' : 'would delete'}=${childrenDeleted} | parents to clear=${parentsToClear.size}`,
	);
}

async function main(): Promise<void> {
	console.info(
		`\n# MC embedded paragraphs ${REVERT ? 'REVERT' : 'migrate embedded→children'} — project=${project}` +
			`${documentId ? ` doc=${documentId}` : ''} ${EXECUTE ? '(EXECUTE)' : '(DRY-RUN)'}\n`,
	);
	if (REVERT) await runRevert();
	else await runForward();
	if (!EXECUTE) console.info('(DRY-RUN — nothing written. Re-run with --execute to apply.)');
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('MC paragraph migration failed:', e);
		process.exit(1);
	});
