/**
 * Seed a question snapshot (from dumpQuestionFromProd.ts) into the EMULATOR for
 * safe, repeatable synthesis testing. Idempotent: clears ALL existing option
 * children under the question first, so every seed restores a pristine corpus
 * (real options only, synthesis OFF) — run synth as many times as you like, no
 * accumulation. Emulator-only.
 *
 * USAGE (from functions/):
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/seedQuestionSnapshot.ts scripts/snapshots/<questionId>.json
 */
import { readFileSync } from 'node:fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set. Emulator-only.');
	process.exit(1);
}
const snapshotPath = process.argv[2];
if (!snapshotPath) {
	console.error('Usage: npx tsx scripts/seedQuestionSnapshot.ts scripts/snapshots/<questionId>.json');
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
const db = getFirestore();

const USER_UID = 'dDKeLPe8IC6EOttQ5Ih6Y9ZXcXfY';
const blankEval = () => ({
	sumEvaluations: 0,
	numberOfEvaluators: 0,
	sumPro: 0,
	sumCon: 0,
	numberOfProEvaluators: 0,
	numberOfConEvaluators: 0,
	sumSquaredEvaluations: 0,
	averageEvaluation: 0,
	agreement: 0,
	evaluationRandomNumber: Math.random(),
	viewed: 0,
});

interface Snapshot {
	questionId: string;
	questionText: string;
	options: Array<{ id: string; text: string; embedding: number[] }>;
}

async function main(): Promise<void> {
	const snap = JSON.parse(readFileSync(snapshotPath, 'utf-8')) as Snapshot;
	const { questionId, questionText, options } = snap;
	const now = Date.now();

	// Question — synthesis OFF (so live triggers never fire on seed writes).
	await db.collection('statements').doc(questionId).set({
		statementId: questionId,
		statement: questionText,
		paragraphs: [],
		statementType: 'question',
		parentId: 'top',
		parents: [],
		topParentId: questionId,
		creatorId: USER_UID,
		creator: { uid: USER_UID, displayName: 'Snapshot Seeder', email: 'seed@example.com', photoURL: null, isAnonymous: false, defaultLanguage: 'he' },
		createdAt: now,
		lastUpdate: now,
		lastChildUpdate: now,
		membership: { access: 'public' },
		statementSettings: { synthesis: { enabled: false }, liveSynthEnabled: false },
	});

	// Idempotent reset: delete every existing option child first.
	const existing = await db
		.collection('statements')
		.where('parentId', '==', questionId)
		.where('statementType', '==', 'option')
		.get();
	for (let i = 0; i < existing.docs.length; i += 400) {
		const batch = db.batch();
		existing.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
		await batch.commit();
	}
	if (existing.size) console.info(`Cleared ${existing.size} existing option children.`);

	let seeded = 0;
	const CHUNK = 50;
	for (let i = 0; i < options.length; i += CHUNK) {
		const batch = db.batch();
		for (const o of options.slice(i, i + CHUNK)) {
			if (!o.embedding?.length) continue;
			const ref = db.collection('statements').doc(o.id);
			batch.set(ref, {
				statementId: o.id,
				statement: o.text,
				paragraphs: [],
				statementType: 'option',
				parentId: questionId,
				parents: [questionId],
				topParentId: questionId,
				creatorId: USER_UID,
				creator: { uid: USER_UID, displayName: 'Snapshot Seeder', email: 'seed@example.com', photoURL: null, isAnonymous: false, defaultLanguage: 'he' },
				createdAt: now,
				lastUpdate: now,
				consensus: 0,
				totalEvaluators: 0,
				hide: false,
				embedding: o.embedding,
				randomSeed: Math.random(),
				evaluation: blankEval(),
			});
			seeded++;
		}
		await batch.commit();
		console.info(`  seeded ${Math.min(i + CHUNK, options.length)}/${options.length}…`);
	}
	console.info(`✓ Seeded ${seeded}/${options.length} options under ${questionId} (synthesis OFF, pristine).`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('seed failed:', e);
		process.exit(1);
	});
