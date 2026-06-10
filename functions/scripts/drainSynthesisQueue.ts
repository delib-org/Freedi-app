/**
 * Manual synthesis-queue drain (emulator only).
 *
 * The production worker `processSynthesisQueue` is an onSchedule('every 1
 * minute') function, and the Firebase emulator does NOT fire scheduled
 * functions. So an admin-triggered "Synthesize" enqueues items into
 * `synthesisQueue/{questionId}/items` and the progress doc sits at
 * `status: running, processed: 0` forever locally.
 *
 * This script does exactly what `processQuestionBatch` does — drains the
 * items subcollection through `runSinglePipeline` / `rejudgeMedoidPair`,
 * updating the same progress doc — but loops until the queue is empty
 * instead of processing one scheduled batch.
 *
 * USAGE (from functions/):
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx --env-file=.env scripts/drainSynthesisQueue.ts <questionId>
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set. Emulator-only.');
	process.exit(1);
}
const questionId = process.argv[2];
if (!questionId) {
	console.error('Usage: npx tsx --env-file=.env scripts/drainSynthesisQueue.ts <questionId>');
	process.exit(1);
}

if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}

const QUEUE_COLLECTION = 'synthesisQueue';
const ITEMS_SUBCOLLECTION = 'items';
const MAX_ATTEMPTS = 3;
const PROCESS_BATCH_SIZE = 50;

interface QueueItem {
	itemId: string;
	questionId: string;
	kind: 'process-option' | 'rejudge-medoid-pair';
	optionId?: string;
	medoidPair?: { a: string; b: string };
	forceProcess?: boolean;
	attempts?: number;
}

async function main(): Promise<void> {
	// Dynamic import AFTER initializeApp so any module-load getFirestore() calls
	// resolve against the initialized (emulator-bound) app.
	const { runSinglePipeline } = await import('../src/synthesis/pipeline/runSinglePipeline');
	const { rejudgeMedoidPair } = await import('../src/synthesis/pipeline/rejudgeMedoidPair');
	const db = getFirestore();

	async function processItem(item: QueueItem): Promise<void> {
		if (item.kind === 'process-option' && item.optionId) {
			await runSinglePipeline({
				optionId: item.optionId,
				source: 'queueWorker',
				forceProcess: item.forceProcess ?? false,
			});

			return;
		}
		if (item.kind === 'rejudge-medoid-pair' && item.medoidPair) {
			await rejudgeMedoidPair(item.medoidPair, item.questionId);

			return;
		}
		throw new Error(`unknown queue item kind: ${item.kind}`);
	}

	async function updateProgress(processed: number, failed: number): Promise<void> {
		const ref = db.collection(QUEUE_COLLECTION).doc(questionId);
		await db.runTransaction(async (tx) => {
			const snap = await tx.get(ref);
			if (!snap.exists) return;
			const before = snap.data() as Record<string, number | string>;
			const processedCount = (Number(before.processedCount) || 0) + processed;
			const failedCount = (Number(before.failedCount) || 0) + failed;
			const pendingCount = Math.max(0, (Number(before.pendingCount) || 0) - processed - failed);
			tx.update(ref, {
				processedCount,
				failedCount,
				pendingCount,
				etaMinutes: Math.ceil(pendingCount / PROCESS_BATCH_SIZE),
				lastTickAt: Date.now(),
				...(pendingCount === 0 ? { status: 'completed' } : {}),
			});
		});
	}

	let round = 0;
	let totalProcessed = 0;
	let totalFailed = 0;
	for (;;) {
		round++;
		const batchSnap = await db
			.collection(QUEUE_COLLECTION)
			.doc(questionId)
			.collection(ITEMS_SUBCOLLECTION)
			.where('attempts', '<', MAX_ATTEMPTS)
			.orderBy('attempts')
			.orderBy('enqueuedAt')
			.limit(PROCESS_BATCH_SIZE)
			.get();

		if (batchSnap.empty) {
			// maybeCompleteQuestion
			const ref = db.collection(QUEUE_COLLECTION).doc(questionId);
			await db.runTransaction(async (tx) => {
				const snap = await tx.get(ref);
				if (!snap.exists) return;
				const before = snap.data() as Record<string, number | string>;
				if (before.status === 'running' && (Number(before.pendingCount) || 0) === 0) {
					tx.update(ref, { status: 'completed', lastTickAt: Date.now() });
				}
			});
			break;
		}

		let processed = 0;
		let failed = 0;
		for (const itemDoc of batchSnap.docs) {
			const item = itemDoc.data() as QueueItem;
			const label = item.optionId ?? `${item.medoidPair?.a}/${item.medoidPair?.b}`;
			try {
				await processItem(item);
				await itemDoc.ref.delete();
				processed++;
				process.stdout.write(`  ✓ ${item.kind} ${label}\n`);
			} catch (error) {
				const attempts = (item.attempts ?? 0) + 1;
				const msg = error instanceof Error ? error.message : String(error);
				if (attempts >= MAX_ATTEMPTS) {
					await itemDoc.ref.update({ attempts, lastError: msg, failedAt: Date.now() });
					failed++;
					process.stdout.write(`  ✗ ${item.kind} ${label} — FAILED (${msg})\n`);
				} else {
					await itemDoc.ref.update({ attempts, lastError: msg });
					process.stdout.write(`  ↻ ${item.kind} ${label} — retry ${attempts} (${msg})\n`);
				}
			}
		}
		await updateProgress(processed, failed);
		totalProcessed += processed;
		totalFailed += failed;
		console.info(`round ${round}: processed=${processed} failed=${failed}`);
		// If a whole batch only produced failures-with-retries (no deletes), stop
		// to avoid an infinite loop on permanently-stuck items.
		if (processed === 0 && failed === 0) break;
	}

	const prog = await db.collection(QUEUE_COLLECTION).doc(questionId).get();
	console.info('\n=========== DRAIN COMPLETE ===========');
	console.info(`total processed=${totalProcessed} failed=${totalFailed}`);
	console.info('progress doc:', JSON.stringify(prog.data()));
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('drain failed:', e);
		process.exit(1);
	});
