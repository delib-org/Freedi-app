/**
 * READ-ONLY: dump a live question's REAL user options (with embeddings) from
 * production to a local JSON snapshot, so it can be replayed in the emulator
 * for safe synthesis testing. NO WRITES — only `.get()`.
 *
 * Skips synthesis-output docs (anything with integratedOptions / isCluster /
 * derivedByPipeline / liveSynthOrigin) — only genuine user options are dumped.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/dumpQuestionFromProd.ts <questionId>
 *   → writes scripts/snapshots/<questionId>.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('FIRESTORE_EMULATOR_HOST is set — unset it to read production. Aborting.');
	process.exit(1);
}
const questionId = process.argv[2];
const project = process.env.GCLOUD_PROJECT;
if (!questionId || !project) {
	console.error('Usage: GCLOUD_PROJECT=wizcol-app npx tsx scripts/dumpQuestionFromProd.ts <questionId>');
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });
const db = getFirestore();

const extractEmbedding = (raw: unknown): number[] | null => {
	if (Array.isArray(raw)) return raw as number[];
	if (raw && typeof raw === 'object' && 'toArray' in raw) {
		try {
			return (raw as { toArray: () => number[] }).toArray();
		} catch {
			return null;
		}
	}
	return null;
};

const isDerived = (x: Record<string, unknown>): boolean =>
	(Array.isArray(x.integratedOptions) && x.integratedOptions.length > 0) ||
	x.isCluster === true ||
	!!x.derivedByPipeline ||
	!!x.liveSynthOrigin;

async function main(): Promise<void> {
	const qSnap = await db.collection('statements').doc(questionId).get();
	if (!qSnap.exists) {
		console.error('Question not found.');
		process.exit(1);
	}
	const q = qSnap.data() ?? {};
	const snap = await db
		.collection('statements')
		.where('parentId', '==', questionId)
		.where('statementType', '==', 'option')
		.get();

	const options: Array<{ id: string; text: string; embedding: number[]; evaluators: number }> = [];
	let skippedDerived = 0;
	let missingEmb = 0;
	for (const d of snap.docs) {
		const x = d.data();
		if (isDerived(x)) {
			skippedDerived++;
			continue;
		}
		const embedding = extractEmbedding(x.embedding);
		if (!embedding) {
			missingEmb++;
			continue;
		}
		options.push({
			id: x.statementId ?? d.id,
			text: x.statement ?? '',
			embedding,
			evaluators: x.evaluation?.numberOfEvaluators ?? 0,
		});
	}

	const out = {
		sourceProject: project,
		questionId,
		questionText: q.statement ?? '',
		dumpedCount: options.length,
		options,
	};
	mkdirSync('scripts/snapshots', { recursive: true });
	const path = `scripts/snapshots/${questionId}.json`;
	writeFileSync(path, JSON.stringify(out, null, 0));
	console.info(
		`✓ Dumped ${options.length} real options (skipped ${skippedDerived} derived, ${missingEmb} missing-embedding) → functions/${path}`,
	);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('dump failed:', e);
		process.exit(1);
	});
