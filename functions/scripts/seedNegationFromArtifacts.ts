/**
 * One-off: seed the negation validation corpus (NegationTest0001) into the
 * Firestore emulator directly from the SHIPPED artifacts of the original run
 * (statements.json + embeddings.json), bypassing the OpenAI embedding trigger.
 *
 * This lets us re-run the production two-tier judge on the EXACT same input
 * vectors as the original 7/11 negation run, to measure whether the
 * quorum-tolerant complete-linkage change rescues the 3/20 members the strict
 * unanimity rule dropped to dissent. Emulator-only.
 *
 * USAGE (from functions/):
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/seedNegationFromArtifacts.ts
 */
import { readFileSync } from 'node:fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set. Emulator-only.');
	process.exit(1);
}
if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}

const RUN = '../scientific-research/validation/4-6-2026-20-10-5-negation-validation';
const QUESTION_ID = 'NegationTest0001';
const QUESTION_TEXT = 'What should our country do';
const USER_UID = 'dDKeLPe8IC6EOttQ5Ih6Y9ZXcXfY';

interface SeedStatement {
	id: string;
	text: string;
	groundTruthTopic: string;
	groundTruthSynth: string;
	expectedRole?: string;
}

const db = getFirestore();

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

async function main(): Promise<void> {
	const statementsDoc = JSON.parse(readFileSync(`${RUN}/statements.json`, 'utf-8')) as {
		statements: SeedStatement[];
	};
	const embDoc = JSON.parse(readFileSync(`${RUN}/embeddings.json`, 'utf-8')) as {
		embeddings: Record<string, number[]>;
	};
	const statements = statementsDoc.statements;
	const embeddings = embDoc.embeddings;

	const now = Date.now();

	// Question (synthesis OFF so the live pipeline never fires on writes).
	await db.collection('statements').doc(QUESTION_ID).set({
		statementId: QUESTION_ID,
		statement: QUESTION_TEXT,
		paragraphs: [],
		statementType: 'question',
		parentId: 'top',
		parents: [],
		topParentId: QUESTION_ID,
		creatorId: USER_UID,
		creator: { uid: USER_UID, displayName: 'Artifact Seeder', email: 'seed@example.com', photoURL: null, isAnonymous: false, defaultLanguage: 'en' },
		createdAt: now,
		lastUpdate: now,
		lastChildUpdate: now,
		membership: { access: 'public' },
		statementSettings: {
			enableAddVotingOption: true,
			enableAddEvaluationOption: true,
			enableNotifications: false,
			synthesis: { enabled: false },
			liveSynthEnabled: false,
		},
	});

	// Clear any pre-existing options under the question (idempotent re-seed).
	const existing = await db
		.collection('statements')
		.where('parentId', '==', QUESTION_ID)
		.where('statementType', '==', 'option')
		.get();
	for (const d of existing.docs) await d.ref.delete();
	if (existing.size) console.info(`Cleared ${existing.size} pre-existing options.`);

	let withEmb = 0;
	for (const s of statements) {
		const embedding = embeddings[s.id];
		if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
			console.warn(`⚠️ no embedding for ${s.id} — skipping`);
			continue;
		}
		withEmb++;
		await db.collection('statements').doc(s.id).set({
			statementId: s.id,
			statement: s.text,
			paragraphs: [],
			statementType: 'option',
			parentId: QUESTION_ID,
			parents: [QUESTION_ID],
			topParentId: QUESTION_ID,
			creatorId: USER_UID,
			creator: { uid: USER_UID, displayName: 'Artifact Seeder', email: 'seed@example.com', photoURL: null, isAnonymous: false, defaultLanguage: 'en' },
			createdAt: now,
			lastUpdate: now,
			consensus: 0,
			totalEvaluators: 0,
			hide: false,
			embedding,
			randomSeed: Math.random(),
			evaluation: blankEval(),
		});
	}
	console.info(`✓ Seeded ${withEmb}/${statements.length} options with embeddings under ${QUESTION_ID}`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('seed failed:', e);
		process.exit(1);
	});
