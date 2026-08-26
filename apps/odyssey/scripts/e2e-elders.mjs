/**
 * e2e-elders — the Elders play the island's square, end to end, no browser.
 *
 * Proves the chain that makes an elder a real counterpart rather than décor:
 * the game's elder personas ride provisioning into the civic topic package as
 * askable characters, the session's flow turns the council on, a player's
 * proposal gets an in-character verdict, a RE-ask moves the elder gradually
 * (persuasion, never a mood swing), and the elder's opinion lands in the real
 * evaluations collection under deterministic AI uids — overwritten on re-ask,
 * never double-counted.
 *
 * Runs against emulators; point AGORA_FIRESTORE_HOST / AGORA_AUTH_HOST /
 * AGORA_FUNCTIONS_HOST at an isolated stack when the default ports belong to
 * another worktree.
 *
 *   node apps/odyssey/scripts/e2e-elders.mjs
 */
import { createRequire } from 'node:module';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
	preflight,
	AUTH_HOST,
	FIRESTORE_HOST,
	FUNCTIONS_BASE,
} from '../../agora/scripts/lib/preflight.mjs';

const require = createRequire(import.meta.url);
const { Collections, agoraScoreToEvaluation, createAgoraAiRaterUid } =
	require('@freedi/shared-types');

const IDENTITY = `${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST.replace(/^https?:\/\//, '');
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: 'freedi-test' });
const db = getFirestore(app);

const RUN = `elders-${Date.now()}`;
const GAME_ID = `${RUN}-game`;
const ISLAND_ID = `${RUN}-island`;
const LEFT_STANCE = `${RUN}-stance-left`;
const RIGHT_STANCE = `${RUN}-stance-right`;
const ELDER_ID = 'bg';
const ELDER_CHARACTER_ID = `elder--${ELDER_ID}`;

let failures = 0;
function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : ` — expected ${expected}, got ${actual}`}`);
	if (!ok) failures++;
}
function checkTrue(label, condition, detail = '') {
	console.log(`${condition ? '  ✓' : '  ✗'} ${label}${condition ? '' : ` — ${detail}`}`);
	if (!condition) failures++;
}

async function callable(name, data, token) {
	const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ data }),
		signal: AbortSignal.timeout(120_000),
	});
	const json = await res.json();
	if (json.error) {
		throw new Error(`${name} failed: ${json.error.status ?? ''} ${json.error.message ?? ''}`.trim());
	}
	if (json.result === undefined) throw new Error(`${name} returned no result (HTTP ${res.status})`);

	return json.result;
}

async function signInGoogle(sub) {
	const res = await fetch(`${IDENTITY}/accounts:signInWithIdp?key=fake`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			postBody: `id_token=${encodeURIComponent(
				JSON.stringify({ sub, email: `${sub}@example.com`, name: 'Elder Tester' }),
			)}&providerId=google.com`,
			requestUri: 'http://localhost',
			returnSecureToken: true,
		}),
	});
	const json = await res.json();
	if (!json.idToken || !json.localId) throw new Error(`Google sign-in failed for ${sub}`);

	return { uid: json.localId, idToken: json.idToken };
}

function statement(statementId, text, parentId, topParentId, type) {
	return {
		statementId,
		statement: text,
		statementType: type,
		parentId,
		topParentId,
		creatorId: 'seed',
		createdAt: Date.now(),
		lastUpdate: Date.now(),
	};
}

async function seedGameWithElders(adminUid) {
	const root = `${RUN}-root`;
	await db
		.collection(Collections.statements)
		.doc(root)
		.set(statement(root, 'אודיסאה — בדיקת זקנים', 'top', 'top', 'question'));
	await db
		.collection(Collections.statements)
		.doc(ISLAND_ID)
		.set(statement(ISLAND_ID, 'מה הדרך הנכונה לברר אחריות?', root, root, 'question'));
	await db
		.collection(Collections.statements)
		.doc(LEFT_STANCE)
		.set(statement(LEFT_STANCE, 'ועדת חקירה ממלכתית בהקדם', ISLAND_ID, root, 'option'));
	await db
		.collection(Collections.statements)
		.doc(RIGHT_STANCE)
		.set(statement(RIGHT_STANCE, 'להתמקד כעת בניצחון ובשיקום', ISLAND_ID, root, 'option'));

	await db
		.collection(Collections.odysseyGames)
		.doc(GAME_ID)
		.set({
			gameId: GAME_ID,
			script: { eldersEnabled: true },
			rootStatementId: root,
			texts: {},
			compassQuestions: [],
			values: [],
			islands: [
				{
					statementId: ISLAND_ID,
					title: 'האחריות',
					issue: 'חקירה ואמון במוסדות',
					shortExplain: 'מי אחראי, מתי, ואיך בודקים.',
					opening: '',
					depthQuestion: '',
					imageUrl: null,
					posX: 13,
					posY: 34,
					sortOrder: 1,
					enabled: true,
					leftAnchorStanceId: LEFT_STANCE,
					rightAnchorStanceId: RIGHT_STANCE,
				},
			],
			parties: [],
			elders: [
				{
					elderId: ELDER_ID,
					name: 'דוד בן-גוריון',
					role: 'ראש הממשלה הראשון',
					portraitUrl: null,
					color: '#1f4e79',
					bio: 'דמות בינה מלאכותית בהשראת דוד בן-גוריון',
					needs: ['ממלכתיות ומוסדות חזקים', 'הכרעות ברורות'],
					values: [
						{
							valueId: 'mamlachtiut',
							label: 'ממלכתיות',
							description: 'מוסדות המדינה קודמים לכל מגזר',
						},
					],
					positions: { [ISLAND_ID]: LEFT_STANCE },
					reactions: { [LEFT_STANCE]: 'agree', [RIGHT_STANCE]: 'oppose' },
					challenges: { [ISLAND_ID]: 'בוא נתווכח על ועדת החקירה' },
					sortOrder: 1,
					enabled: true,
				},
				{
					elderId: 'off',
					name: 'כבוי',
					role: '',
					portraitUrl: null,
					color: '#000000',
					bio: '',
					needs: [],
					values: [],
					positions: {},
					reactions: {},
					challenges: {},
					sortOrder: 2,
					enabled: false,
				},
			],
			adminUids: [],
			creatorId: adminUid,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
		});
}

async function main() {
	await preflight({ needs: ['firestore', 'auth', 'functions'], seed: false });

	console.log('\n▸ seeding an Odyssey game whose script invites the elders');
	const admin = await signInGoogle(`${RUN}-admin`);
	await seedGameWithElders(admin.uid);

	console.log('▸ the admin opens the deliberations');
	const provisioned = await callable(
		'agoraProvisionCivicSessions',
		{ gameId: GAME_ID },
		admin.idToken,
	);
	check('one session opened', provisioned.sessions.length, 1);
	const { sessionId, code } = provisioned.sessions[0];

	const session = (await db.collection(Collections.agoraSessions).doc(sessionId).get()).data();
	check('the flow turns the council on', session.flow?.elders, true);

	const topic = (
		await db.collection(Collections.agoraTopicPackages).doc(session.topicPackageId).get()
	).data();
	check('package carries voices + the enabled elder only', topic.characters.length, 3);
	const elderCharacter = topic.characters.find(
		(character) => character.characterId === ELDER_CHARACTER_ID,
	);
	checkTrue('the elder is an askable character', Boolean(elderCharacter), 'missing');
	check('flagged as an elder persona', elderCharacter?.isElder, true);
	check('named as the figure', elderCharacter?.name, 'דוד בן-גוריון');
	checkTrue(
		'argues its declared stance on this island',
		(elderCharacter?.arguments ?? []).includes('ועדת חקירה ממלכתית בהקדם'),
		JSON.stringify(elderCharacter?.arguments),
	);

	console.log('▸ a player joins and pins a proposal to the square');
	const player = await signInGoogle(`${RUN}-player`);
	const joined = await callable('agoraJoinSession', { code }, player.idToken);
	check('joined the session', joined.sessionId, sessionId);

	const proposalId = `${RUN}-proposal`;
	await db
		.collection(Collections.statements)
		.doc(proposalId)
		.set({
			...statement(
				proposalId,
				'ועדת בדיקה מוסכמת שתסכם כללים יחד, בהדרגה ובאחריות ממלכתית',
				session.challengeQuestionId,
				session.rootStatementId,
				'option',
			),
			creatorId: player.uid,
			agoraSessionId: sessionId,
		});

	console.log('▸ the council reads the fresh proposal UNPROMPTED (auto-review trigger)');
	const autoReviewId = `${proposalId}--${ELDER_CHARACTER_ID}`;
	let autoReview = null;
	for (let attempt = 0; attempt < 30 && !autoReview; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, 2000));
		const snap = await db
			.collection(Collections.agoraCharacterReviews)
			.doc(autoReviewId)
			.get();
		if (snap.exists && typeof snap.data().acceptanceScore === 'number') {
			autoReview = snap.data();
		}
	}
	checkTrue(
		'an unasked verdict appeared',
		Boolean(autoReview),
		'no auto review within 60s — is onAgoraProposalWritten built into the emulator?',
	);
	checkTrue(
		'and it spends no ask budget',
		Object.keys(autoReview?.asksByRound ?? {}).length === 0,
		JSON.stringify(autoReview?.asksByRound),
	);

	console.log('▸ the elder reads the proposal');
	const first = await callable(
		'agoraCharacterReview',
		{ sessionId, characterId: ELDER_CHARACTER_ID, statementId: proposalId },
		player.idToken,
	);
	checkTrue('speaks in first person', first.verdictText.length > 0, 'empty verdict');
	checkTrue(
		'scores inside the scale',
		first.acceptanceScore >= 0 && first.acceptanceScore <= 100,
		String(first.acceptanceScore),
	);

	console.log('▸ the player improves the text toward the elder’s needs and asks again');
	await db.collection(Collections.statements).doc(proposalId).update({
		statement:
			'ועדת בדיקה ממלכתית בהסכמה רחבה: כללים שנכתבים יחד, לוח זמנים מוסכם, הכרעות ברורות בסוף כל שלב, ומוסדות חזקים שמובילים את היישום',
		lastUpdate: Date.now(),
	});
	const second = await callable(
		'agoraCharacterReview',
		{ sessionId, characterId: ELDER_CHARACTER_ID, statementId: proposalId },
		player.idToken,
	);
	// Monotone rise is guaranteed only on the deterministic fixture path (no
	// OPENAI_API_KEY) and is covered by the jest suite; against a live model
	// the hard server-side promise is gradualism — at most 15 points per ask.
	console.log(`    (score moved ${first.acceptanceScore} -> ${second.acceptanceScore})`);
	checkTrue(
		'the elder moves at most 15 points per ask',
		Math.abs(second.acceptanceScore - first.acceptanceScore) <= 15,
		`${first.acceptanceScore} -> ${second.acceptanceScore}`,
	);

	console.log('▸ the elder’s opinion is a real evaluation, not a side channel');
	const expectedValue = agoraScoreToEvaluation(second.acceptanceScore);
	for (let index = 1; index <= 3; index++) {
		const aiUid = createAgoraAiRaterUid(ELDER_CHARACTER_ID, index);
		const evaluation = (
			await db.collection(Collections.evaluations).doc(`${aiUid}--${proposalId}`).get()
		).data();
		checkTrue(`rater ${index} evaluated`, Boolean(evaluation), 'missing evaluation doc');
		check(`rater ${index} holds the latest verdict (overwritten, not duplicated)`,
			evaluation?.evaluation,
			expectedValue,
		);
	}

	console.log(
		failures === 0
			? '\n✓ the elders sail the square: askable, persuadable, and counted\n'
			: `\n✗ ${failures} check(s) failed\n`,
	);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
	console.error('\n✗ e2e-elders failed:', error.message);
	process.exit(1);
});
