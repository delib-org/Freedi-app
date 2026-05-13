/**
 * Bootstraps a fresh emulator with:
 *   - A top-level question statement at FcHcx95CnkN2
 *   - An Olive Panda creator/admin user
 *   - Admin subscription linking the user to the question
 *
 * Used when we've just restarted emulators and need a target for the
 * synthesis test workflow before running `importQuestionToEmulator.ts`.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set.');
	process.exit(1);
}

if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}
const db = getFirestore();

const QUESTION_ID = 'FcHcx95CnkN2';
const USER_UID = 'B0KrYl2gHjBrOB6NAD0BW6FzGKkE';
const USER_NAME = 'Olive Panda';
const USER_EMAIL = 'olive.panda.27@example.com';

(async () => {
	const now = Date.now();

	const question = {
		statementId: QUESTION_ID,
		statement: 'Synthesis Test Question',
		paragraphs: [],
		statementType: 'question',
		parentId: 'top',
		parents: [],
		topParentId: QUESTION_ID,
		creatorId: USER_UID,
		creator: {
			uid: USER_UID,
			displayName: USER_NAME,
			email: USER_EMAIL,
			photoURL: null,
			isAnonymous: false,
			defaultLanguage: 'en',
		},
		createdAt: now,
		lastUpdate: now,
		lastChildUpdate: now,
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
		statementSettings: {
			enableAddVotingOption: true,
			enableAddEvaluationOption: true,
			enableNotifications: false,
		},
	};

	await db.collection('statements').doc(QUESTION_ID).set(question);
	console.info(`✓ Created question ${QUESTION_ID}`);

	const subId = `${USER_UID}--${QUESTION_ID}`;
	await db.collection('statementsSubscribe').doc(subId).set({
		statementsSubscribeId: subId,
		userId: USER_UID,
		statementId: QUESTION_ID,
		role: 'admin',
		lastUpdate: now,
		user: { uid: USER_UID, displayName: USER_NAME, email: USER_EMAIL },
		statement: question,
	});
	console.info(`✓ Created admin subscription ${subId}`);

	await db.collection('usersV2').doc(USER_UID).set({
		uid: USER_UID,
		displayName: USER_NAME,
		email: USER_EMAIL,
		isAnonymous: false,
		defaultLanguage: 'en',
		createdAt: now,
	});
	console.info(`✓ Created usersV2/${USER_UID}`);

	console.info(`\nReady. Question id: ${QUESTION_ID}, admin uid: ${USER_UID}`);
})().catch((e) => {
	console.error('Bootstrap failed:', e);
	process.exit(1);
});
