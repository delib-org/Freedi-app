/**
 * "Re-cluster from scratch" for one question, run from a script with the same
 * internals the `reCluster` callable uses (dissolve → enqueue every option →
 * progress doc). The deployed queue worker then rebuilds the clusters.
 *
 * DESTRUCTIVE for the question's synthesis output — take a snapshot first
 * (fetch2.cjs). Refuses to run against an emulator by accident of env.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=wizcol-app npx tsx \
 *     ../scientific-research/2026-09-18-theme-layer-narrow-questions/scripts/reclusterProd.ts <questionId>
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, StatementType, type Statement } from '@freedi/shared-types';

if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('FIRESTORE_EMULATOR_HOST is set; this script targets production.');
	process.exit(1);
}
const projectId = process.env.GCLOUD_PROJECT;
const questionId = process.argv[2];
if (!projectId || !questionId) {
	console.error('usage: GCLOUD_PROJECT=<prod project> reclusterProd.ts <questionId>');
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId });

async function main(): Promise<void> {
	const { dissolveQuestionSynthesis } = await import('../../../functions/src/synthesis/derivedDocs');
	const { loadSynthesisSettings } = await import(
		'../../../functions/src/synthesis/pipeline/loadSynthesisSettings'
	);
	const { enqueueItem, initProgressDoc } = await import('../../../functions/src/synthesis/queue/enqueue');
	const { isRunInFlight, estimateEtaMinutes } = await import('../../../functions/src/synthesis/queue/runState');
	const { QUEUE_COLLECTION } = await import('../../../functions/src/synthesis/queue/types');

	const db = getFirestore();
	const progress = await db.collection(QUEUE_COLLECTION).doc(questionId).get();
	if (progress.exists && isRunInFlight(progress.data() as never, Date.now())) {
		console.error('a synthesis operation is already running for this question; aborting');
		process.exit(2);
	}

	const dissolve = await dissolveQuestionSynthesis(questionId, { reversedByUserId: 'recluster-script' });
	console.info('dissolved', dissolve);

	const settings = await loadSynthesisSettings(questionId);
	const snap = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionId)
		.where('statementType', '==', StatementType.option)
		.get();
	let enqueued = 0;
	let skipped = 0;
	for (const doc of snap.docs) {
		const option = doc.data() as Statement;
		if ((option.integratedOptions ?? []).length > 0) {
			skipped++;
			continue;
		}
		if ((option.evaluation?.numberOfEvaluators ?? 0) < settings.minEvaluators) {
			skipped++;
			continue;
		}
		await enqueueItem({ questionId, kind: 'process-option', optionId: option.statementId, forceProcess: false });
		enqueued++;
	}
	await initProgressDoc({ questionId, enqueuedCount: enqueued, operation: 'recluster', initiatedBy: 'recluster-script' });
	console.info(`enqueued ${enqueued}, skipped ${skipped}, eta ~${estimateEtaMinutes(enqueued)} min`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
