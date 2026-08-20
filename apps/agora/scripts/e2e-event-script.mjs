/**
 * e2e-event-script — an organizer's script, end to end, without a browser.
 *
 * The claim under test is the one the whole feature rests on: that an event
 * which runs WITHOUT camps still measures something real. Every link in that
 * chain fails quietly. A stripped schema field leaves the session running the
 * classroom defaults; a camp derived anyway puts people in wings nobody asked
 * about; and a convergence score computed over the wrong population reports
 * that a room came together when it merely emptied.
 *
 * Runs against emulators. Point it at an isolated stack with
 * AGORA_FIRESTORE_HOST / AGORA_AUTH_HOST / AGORA_FUNCTIONS_HOST when the
 * default ports belong to someone else.
 *
 *   node apps/agora/scripts/e2e-event-script.mjs
 */
import { createRequire } from 'node:module';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { preflight, AUTH_HOST, FIRESTORE_HOST, FUNCTIONS_BASE } from './lib/preflight.mjs';

const require = createRequire(import.meta.url);
const {
	Collections,
	AgoraStage,
	ODYSSEY_EVENT_SCRIPT,
	createAgoraParticipantId,
	resolveSessionFlow,
} = require('@freedi/shared-types');

const IDENTITY = `${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST.replace(/^https?:\/\//, '');
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: 'freedi-test' });
const db = getFirestore(app);

const RUN = `script-${Date.now()}`;
const GAME_ID = `${RUN}-game`;
const ISLAND_ID = `${RUN}-island`;
/** Four stances, the shape a real island has — and one the 5-stance floor cannot measure. */
const STANCES = [1, 2, 3, 4].map((n) => `${RUN}-stance-${n}`);

let failures = 0;
function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : ` — expected ${expected}, got ${actual}`}`);
	if (!ok) failures++;
}

function assert(label, condition, detail) {
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
				JSON.stringify({ sub, email: `${sub}@example.com`, name: sub }),
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

async function seedGame(adminUid, script) {
	const root = `${RUN}-root`;
	await db
		.collection(Collections.statements)
		.doc(root)
		.set(statement(root, 'אירוע', 'top', 'top', 'question'));
	await db
		.collection(Collections.statements)
		.doc(ISLAND_ID)
		.set(statement(ISLAND_ID, 'מה הדרך הנכונה לברר אחריות?', root, root, 'question'));
	for (const [index, stanceId] of STANCES.entries()) {
		await db
			.collection(Collections.statements)
			.doc(stanceId)
			.set(statement(stanceId, `עמדה ${index + 1}`, ISLAND_ID, root, 'option'));
	}

	await db
		.collection(Collections.odysseyGames)
		.doc(GAME_ID)
		.set({
			gameId: GAME_ID,
			script,
			rootStatementId: root,
			texts: {},
			compassQuestions: [],
			values: [],
			islands: [
				{
					statementId: ISLAND_ID,
					title: 'האחריות',
					issue: 'שבעה באוקטובר, חקירה ואמון במוסדות',
					shortExplain: 'מי אחראי, מתי, ואיך בודקים.',
					opening: 'הגעתם לאי שבו צריך לשאול מי אחראי.',
					depthQuestion: '',
					imageUrl: null,
					posX: 13,
					posY: 34,
					sortOrder: 1,
					enabled: true,
					leftAnchorStanceId: STANCES[0],
					rightAnchorStanceId: STANCES[3],
				},
			],
			parties: [],
			adminUids: [],
			creatorId: adminUid,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
		});
}

/** One person's answers across the whole island. */
async function rateIsland(uid, values) {
	for (const [index, stanceId] of STANCES.entries()) {
		const evaluationId = `${uid}--${stanceId}`;
		await db
			.collection(Collections.evaluations)
			.doc(evaluationId)
			.set({
				evaluationId,
				parentId: ISLAND_ID,
				statementId: stanceId,
				evaluatorId: uid,
				evaluator: { uid, displayName: uid, isAnonymous: false },
				evaluation: values[index],
				updatedAt: Date.now(),
				odysseyGameId: GAME_ID,
			});
	}
}

async function main() {
	await preflight({ needs: ['firestore', 'auth', 'functions'], seed: false });

	console.log('\n▸ an organizer scripts an event with no camps');
	const admin = await signInGoogle(`${RUN}-admin`);
	await seedGame(admin.uid, ODYSSEY_EVENT_SCRIPT);

	const provisioned = await callable(
		'agoraProvisionCivicSessions',
		{ gameId: GAME_ID },
		admin.idToken,
	);
	const { sessionId, code } = provisioned.sessions[0];

	const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
	const session = sessionSnap.data();
	check('the script reached the session', session.flow?.stances, false);
	check('and survived the schema', resolveSessionFlow(session).scoreMode, 'convergence');
	check('the short cycle came with it', resolveSessionFlow(session).rounds, 3);

	const topic = (
		await db.collection(Collections.agoraTopicPackages).doc(session.topicPackageId).get()
	).data();
	check('the opening scene was built from the island', topic.scenes.length, 1);
	assert(
		'and it speaks the island’s own words',
		topic.scenes[0]?.text?.includes('מי אחראי'),
		`got "${topic.scenes[0]?.text}"`,
	);

	console.log('▸ three people arrive holding three different positions');
	// Far apart at the start: two of them are near-opposites.
	const opening = {
		ann: [1, 1, -1, -1],
		ben: [-1, -1, 1, 1],
		cal: [1, 0.5, -0.5, -1],
	};
	const people = {};
	for (const [name, values] of Object.entries(opening)) {
		people[name] = await signInGoogle(`${RUN}-${name}`);
		await rateIsland(people[name].uid, values);
		await callable('agoraJoinSession', { code }, people[name].idToken);
	}

	for (const name of Object.keys(people)) {
		const participant = (
			await db
				.collection(Collections.agoraParticipants)
				.doc(createAgoraParticipantId(sessionId, people[name].uid))
				.get()
		).data();
		check(`${name} was given no camp`, participant.camp, undefined);
		check(`${name} was given no position on an axis`, participant.campPosition, undefined);
		check(
			`${name}'s starting opinion was kept`,
			Object.keys(participant.stanceBaseline ?? {}).length,
			STANCES.length,
		);
	}

	console.log('▸ the organizer closes the deliberation');
	await callable(
		'agoraAdvanceStage',
		{ sessionId, stage: AgoraStage.results },
		admin.idToken,
	);
	const atResults = (await db.collection(Collections.agoraSessions).doc(sessionId).get()).data();
	check('no bridging score was computed', atResults.classScore, undefined);
	assert('convergence is open but unanswered', atResults.convergence?.before === null, 'expected null');

	console.log('▸ and everyone says where they now stand');
	// All three converge toward the same middle ground.
	const closing = {
		ann: [1, 0.5, 0, -0.5],
		ben: [0.5, 0, 0.5, -0.5],
		cal: [1, 0.5, 0, -0.5],
	};
	let last;
	for (const [name, values] of Object.entries(closing)) {
		last = await callable(
			'agoraRerateStances',
			{ sessionId, ratings: Object.fromEntries(STANCES.map((id, i) => [id, values[i]])) },
			people[name].idToken,
		);
	}

	check('everyone was counted', last.participants, 3);
	assert(
		'the room started apart',
		last.before > 0.2,
		`before was ${last.before}`,
	);
	assert(
		'and ended closer together',
		last.after < last.before,
		`before ${last.before}, after ${last.after}`,
	);
	assert('so the score is positive', last.score > 0, `score was ${last.score}`);

	// The re-rate has to land in the shared evaluation, not a private copy —
	// this is what makes the event visible to Odyssey's own map afterwards.
	const shared = (
		await db.collection(Collections.evaluations).doc(`${people.ann.uid}--${STANCES[3]}`).get()
	).data();
	check('the answers went back to the island', shared.evaluation, -0.5);
	check('still tagged to the game', shared.odysseyGameId, GAME_ID);

	console.log('▸ the organizer changes their mind and re-scripts');
	await db.collection(Collections.odysseyGames).doc(GAME_ID).update({ script: { rounds: 5 } });
	const updated = await callable('agoraUpdateCivicFlow', { gameId: GAME_ID }, admin.idToken);
	check('the open session was re-pointed', updated.updated.length, 1);
	const rescripted = (
		await db.collection(Collections.agoraSessions).doc(sessionId).get()
	).data();
	check('at the new round count', resolveSessionFlow(rescripted).rounds, 5);
	check('and with camps back', resolveSessionFlow(rescripted).stances, true);
	check('the join code never changed', rescripted.code, code);

	console.log(
		failures === 0
			? '\n✓ a camp-less event measures whether the room actually came together\n'
			: `\n✗ ${failures} check(s) failed\n`,
	);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
	console.error('\n✗ e2e-event-script failed:', error.message);
	process.exit(1);
});
