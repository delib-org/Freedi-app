/**
 * Write a single option under a question and print the resulting statement ID.
 * Used to trigger one live-synth pipeline invocation we can read the DIAG log for.
 *
 * USAGE
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/seedOneOption.ts <questionId> "<option text>"
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set.');
	process.exit(1);
}

const QUESTION_ID = process.argv[2];
const TEXT = process.argv[3];
if (!QUESTION_ID || !TEXT) {
	console.error('Usage: npx tsx scripts/seedOneOption.ts <questionId> "<text>"');
	process.exit(1);
}

if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}
const db = getFirestore();

(async () => {
	const id = db.collection('statements').doc().id;
	const now = Date.now();
	await db
		.collection('statements')
		.doc(id)
		.set({
			statementId: id,
			statement: TEXT,
			paragraphs: [],
			statementType: 'option',
			parentId: QUESTION_ID,
			parents: [QUESTION_ID],
			topParentId: QUESTION_ID,
			creatorId: 'diag-seed-uid',
			creator: {
				uid: 'diag-seed-uid',
				displayName: 'Diag Seeder',
				email: 'diag@example.com',
				photoURL: null,
				isAnonymous: false,
				defaultLanguage: 'en',
			},
			createdAt: now,
			lastUpdate: now,
			consensus: 0,
			totalEvaluators: 0,
			hide: false,
			randomSeed: Math.random(),
			evaluation: {
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
			},
		});
	console.info(`✓ Wrote option ${id} under ${QUESTION_ID}: "${TEXT}"`);
})().catch((e) => {
	console.error('Failed:', e);
	process.exit(1);
});
