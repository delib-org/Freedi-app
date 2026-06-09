/**
 * Clean up accumulated synthesis artifacts on a LIVE question and restore
 * orphaned options. DRY-RUN BY DEFAULT — prints exactly what it would change
 * and writes NOTHING unless `--execute` is passed.
 *
 * Targets two problems found on a polluted question:
 *   1. Synthesis-output docs (synths / clusters / topic-clusters) left behind by
 *      multiple uncleaned runs — including LEGACY docs with no `derivedByPipeline`
 *      tag. A doc is treated as synthesis output iff it has any of:
 *        - non-empty `integratedOptions`   (it aggregates other options)
 *        - `isCluster === true`
 *        - a `derivedByPipeline` value
 *        - a `liveSynthOrigin` value
 *      Real user-submitted options carry NONE of these, so they are never matched.
 *   2. Real options hidden with no `integratedInto` (orphaned by a synthesis run
 *      whose synth was later deleted) — these vanished from the user's view.
 *
 * Safety:
 *   - Refuses to run against the emulator (this is a prod-repair tool).
 *   - Dry-run prints every doc it would delete / un-hide, and FLAGS any derived
 *     doc that carries user evaluations (deleting it would discard those votes).
 *   - `--execute` required to write; writes are batched.
 *
 * USAGE (from functions/):
 *   # preview (no writes):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/cleanupProdSynthesisArtifacts.ts <questionId>
 *   # apply:
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/cleanupProdSynthesisArtifacts.ts <questionId> --execute
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('FIRESTORE_EMULATOR_HOST is set — this is a production-repair tool. Aborting.');
	process.exit(1);
}
const questionId = process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]);
const EXECUTE = process.argv.includes('--execute');
const project = process.env.GCLOUD_PROJECT;
if (!questionId || !project) {
	console.error('Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/cleanupProdSynthesisArtifacts.ts <questionId> [--execute]');
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });

const db = getFirestore();
const short = (s: string, n = 70) => ((s ?? '').length > n ? (s ?? '').slice(0, n) + '…' : s ?? '');

interface Doc {
	id: string;
	statement: string;
	integratedOptions?: string[];
	isCluster?: boolean;
	derivedByPipeline?: string;
	liveSynthOrigin?: string;
	hide?: boolean;
	integratedInto?: string;
	createdAt?: number;
	evaluation?: { numberOfEvaluators?: number };
}

const isDerived = (r: Doc): boolean =>
	(Array.isArray(r.integratedOptions) && r.integratedOptions.length > 0) ||
	r.isCluster === true ||
	!!r.derivedByPipeline ||
	!!r.liveSynthOrigin;

async function main(): Promise<void> {
	console.info(`\n# Synthesis cleanup — project=${project} question=${questionId} ${EXECUTE ? '(EXECUTE)' : '(DRY-RUN)'}\n`);

	const snap = await db
		.collection('statements')
		.where('parentId', '==', questionId)
		.where('statementType', '==', 'option')
		.get();
	const rows: Doc[] = snap.docs.map((d) => {
		const x = d.data();
		return {
			id: x.statementId ?? d.id,
			statement: x.statement ?? '',
			integratedOptions: x.integratedOptions,
			isCluster: x.isCluster,
			derivedByPipeline: x.derivedByPipeline,
			liveSynthOrigin: x.liveSynthOrigin,
			hide: x.hide,
			integratedInto: x.integratedInto,
			createdAt: x.createdAt,
			evaluation: x.evaluation,
		};
	});

	const toDelete = rows.filter(isDerived);
	const orphanedHidden = rows.filter((r) => !isDerived(r) && r.hide === true && !r.integratedInto);
	const trueRaw = rows.filter((r) => !isDerived(r));

	console.info(`Total option-children: ${rows.length} | true raw options: ${trueRaw.length}`);
	console.info(`\n## (1) Synthesis-output docs to HIDE (reversible — sets hide=true + archivedByCleanup=true): ${toDelete.length}`);
	const withVotes = toDelete.filter((r) => (r.evaluation?.numberOfEvaluators ?? 0) > 0);
	console.info(`    of which carry user votes (preserved — hidden, not deleted): ${withVotes.length}`);
	const day = (r: Doc) => (r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : '?');
	const byDay: Record<string, number> = {};
	toDelete.forEach((r) => (byDay[day(r)] = (byDay[day(r)] ?? 0) + 1));
	console.info(`    by creation day: ${JSON.stringify(byDay)}`);
	toDelete
		.slice()
		.sort((a, b) => (b.integratedOptions?.length ?? 0) - (a.integratedOptions?.length ?? 0))
		.forEach((r) => {
			const votes = r.evaluation?.numberOfEvaluators ?? 0;
			console.info(
				`    - [${day(r)}] members=${r.integratedOptions?.length ?? 0} votes=${votes}${votes ? '⚠️' : ''} tag=${r.derivedByPipeline ?? 'NONE'} :: "${short(r.statement)}"`,
			);
		});

	console.info(`\n## (2) Orphaned hidden options to UN-HIDE (set hide=false): ${orphanedHidden.length}`);
	orphanedHidden.forEach((r) => console.info(`    + "${short(r.statement, 90)}"`));

	if (!EXECUTE) {
		console.info(`\n(DRY-RUN — nothing written. Re-run with --execute to apply.)`);
		return;
	}

	console.info(`\n=== EXECUTING ===`);
	const now = Date.now();
	const ops: Array<{ kind: 'hide' | 'unhide'; id: string }> = [
		...toDelete.map((r) => ({ kind: 'hide' as const, id: r.id })),
		...orphanedHidden.map((r) => ({ kind: 'unhide' as const, id: r.id })),
	];
	for (let i = 0; i < ops.length; i += 400) {
		const batch = db.batch();
		for (const op of ops.slice(i, i + 400)) {
			const ref = db.collection('statements').doc(op.id);
			if (op.kind === 'hide') batch.update(ref, { hide: true, archivedByCleanup: true, lastUpdate: now });
			else batch.update(ref, { hide: false, lastUpdate: now });
		}
		await batch.commit();
		console.info(`  committed batch ${i / 400 + 1} (${Math.min(400, ops.length - i)} ops)`);
	}
	console.info(`\nDONE. Hid ${toDelete.length} derived docs (archivedByCleanup=true), un-hid ${orphanedHidden.length} options.`);
	console.info(`To reverse the hide later: set hide=false where archivedByCleanup===true under this question.`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('cleanup failed:', e);
		process.exit(1);
	});
