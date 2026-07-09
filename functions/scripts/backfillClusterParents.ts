/**
 * Backfill the `parents` ancestor array on cluster (and other direct-child)
 * statements under one question that were created by the synthesis writers
 * without a `parents` array.
 *
 * Why: the cluster map derives its nodes from `parents[]`, so auto-generated
 * clusters missing that array never appeared on the board (they still showed on
 * the options tab, which filters by parentId). This backfills the correct chain
 * so the data matches the fixed writers.
 *
 * READ-ONLY by default (dry run). Pass `--apply` to write.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillClusterParents.ts <questionId>
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillClusterParents.ts <questionId> --apply
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('FIRESTORE_EMULATOR_HOST is set — unset it to touch production. Aborting.');
	process.exit(1);
}

const questionId = process.argv[2];
const apply = process.argv.includes('--apply');
const project = process.env.GCLOUD_PROJECT;
if (!questionId || !project) {
	console.error(
		'Usage: GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillClusterParents.ts <questionId> [--apply]',
	);
	process.exit(1);
}

if (getApps().length === 0) initializeApp({ projectId: project });
const db = getFirestore();

async function main(): Promise<void> {
	const qSnap = await db.collection('statements').doc(questionId).get();
	if (!qSnap.exists) {
		console.error(`Question ${questionId} not found in project ${project}.`);
		process.exit(1);
	}
	const q = qSnap.data() ?? {};
	const questionParents: string[] = Array.isArray(q.parents) ? (q.parents as string[]) : [];
	// The correct ancestor chain for a DIRECT child of this question.
	const correctParents = [...new Set([...questionParents, questionId])];
	const correctTopParentId = (q.topParentId as string | undefined) || correctParents[0] || questionId;

	console.info(`Project: ${project}`);
	console.info(`Question: ${questionId}`);
	console.info(`Question.parents: ${JSON.stringify(questionParents)}`);
	console.info(`→ correct parents for direct children: ${JSON.stringify(correctParents)}`);
	console.info(`Mode: ${apply ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);
	console.info('—'.repeat(50));

	const kids = await db.collection('statements').where('parentId', '==', questionId).get();

	const toFix: { id: string; text: string; isCluster: boolean; before: unknown }[] = [];
	for (const d of kids.docs) {
		const x = d.data();
		const parents = x.parents as string[] | undefined;
		const ok = Array.isArray(parents) && parents.includes(questionId);
		if (!ok) {
			toFix.push({
				id: d.id,
				text: String(x.statement ?? '').slice(0, 60),
				isCluster: x.isCluster === true,
				before: parents,
			});
		}
	}

	console.info(
		`Direct children: ${kids.size} | need fixing: ${toFix.length} ` +
			`(clusters among them: ${toFix.filter((f) => f.isCluster).length})`,
	);
	for (const f of toFix) {
		console.info(
			`  ${f.isCluster ? '[cluster]' : '[option] '} ${f.id}  parents=${JSON.stringify(
				f.before,
			)}  "${f.text}"`,
		);
	}

	if (!apply) {
		console.info('\nDRY RUN complete. Re-run with --apply to write these changes.');
		return;
	}

	if (toFix.length === 0) {
		console.info('\nNothing to write.');
		return;
	}

	// Batches of 500 (Firestore limit).
	let written = 0;
	for (let i = 0; i < toFix.length; i += 500) {
		const slice = toFix.slice(i, i + 500);
		const batch = db.batch();
		for (const f of slice) {
			const ref = db.collection('statements').doc(f.id);
			batch.update(ref, { parents: correctParents, topParentId: correctTopParentId });
		}
		await batch.commit();
		written += slice.length;
		console.info(`  committed ${written}/${toFix.length}`);
	}

	console.info(`\nAPPLY complete. Updated ${written} statement(s).`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('ERROR:', e instanceof Error ? e.message : e);
		process.exit(2);
	});
