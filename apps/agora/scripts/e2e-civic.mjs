/**
 * e2e-civic — the Odyssey→Agora handoff, end to end, without a browser.
 *
 * The thing worth proving here is not that the callables return 200. It is
 * that a player who took positions on an island arrives in that island's
 * square AS THEMSELVES and ALREADY IN A CAMP — because every link in that
 * chain is silent when it breaks: a stripped schema field serves the
 * classroom track, a refused token joins as a stranger, and a missed
 * evaluation lands everyone in the centre where bridging cannot see them.
 *
 * Runs against emulators. Point it at an isolated stack with
 * AGORA_FIRESTORE_HOST / AGORA_AUTH_HOST / AGORA_FUNCTIONS_HOST when the
 * default ports belong to someone else.
 *
 *   node apps/agora/scripts/e2e-civic.mjs
 */
import { createRequire } from 'node:module';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { preflight, AUTH_HOST, FIRESTORE_HOST, FUNCTIONS_BASE } from './lib/preflight.mjs';

const require = createRequire(import.meta.url);
const { Collections, AgoraCamp, AgoraStage, AgoraSessionMode, createAgoraParticipantId } =
	require('@freedi/shared-types');

const IDENTITY = `${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST.replace(/^https?:\/\//, '');
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: 'freedi-test' });
const db = getFirestore(app);

const RUN = `civic-${Date.now()}`;
const GAME_ID = `${RUN}-game`;
const ISLAND_ID = `${RUN}-island`;
const LEFT_STANCE = `${RUN}-stance-left`;
const RIGHT_STANCE = `${RUN}-stance-right`;

let failures = 0;
function check(label, actual, expected) {
	const ok = actual === expected;
	console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : ` — expected ${expected}, got ${actual}`}`);
	if (!ok) failures++;
}

async function callable(name, data, token) {
	const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ data }),
		// The functions emulator cold-starts the whole bundle on the first call
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
				JSON.stringify({ sub, email: `${sub}@example.com`, name: 'Civic Tester' }),
			)}&providerId=google.com`,
			requestUri: 'http://localhost',
			returnSecureToken: true,
		}),
	});
	const json = await res.json();
	if (!json.idToken || !json.localId) throw new Error(`Google sign-in failed for ${sub}`);

	return { uid: json.localId, idToken: json.idToken };
}

/**
 * The handoff, exercised the way the Agora client does it.
 *
 * Unlike the other sign-in endpoints this one answers with no localId — the
 * uid rides inside the token, which is where the Firebase SDK reads it from
 * to build `credential.user`. Decoding it here is also the assertion: it is
 * the proof that the token really names the player and not somebody new.
 */
async function signInWithCustomToken(token) {
	const res = await fetch(`${IDENTITY}/accounts:signInWithCustomToken?key=fake`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token, returnSecureToken: true }),
	});
	const json = await res.json();
	if (!json.idToken) {
		throw new Error(`Custom-token sign-in failed: ${JSON.stringify(json.error ?? json)}`);
	}

	const claims = JSON.parse(Buffer.from(json.idToken.split('.')[1], 'base64url').toString());

	return { uid: claims.user_id ?? claims.sub, idToken: json.idToken };
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

async function seedOdysseyGame(adminUid) {
	const root = `${RUN}-root`;
	await db
		.collection(Collections.statements)
		.doc(root)
		.set(statement(root, 'אודיסאה — בדיקה', 'top', 'top', 'question'));
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
			adminUids: [],
			creatorId: adminUid,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
		});
}

/** The player's voyage: they backed the right pole and rejected the left one. */
async function seedPlayerStances(uid) {
	const write = (stanceId, value) =>
		db
			.collection(Collections.evaluations)
			.doc(`${uid}--${stanceId}`)
			.set({
				evaluationId: `${uid}--${stanceId}`,
				parentId: ISLAND_ID,
				statementId: stanceId,
				evaluatorId: uid,
				evaluator: { uid, displayName: 'Civic Tester', isAnonymous: false },
				evaluation: value,
				updatedAt: Date.now(),
				odysseyGameId: GAME_ID,
			});

	await write(LEFT_STANCE, -1);
	await write(RIGHT_STANCE, 1);
}

async function main() {
	await preflight({ needs: ['firestore', 'auth', 'functions'], seed: false });

	console.log('\n▸ seeding an Odyssey game with one anchored island');
	const admin = await signInGoogle(`${RUN}-admin`);
	await seedOdysseyGame(admin.uid);

	console.log('▸ a player sails it, opposing one pole and backing the other');
	const player = await signInGoogle(`${RUN}-player`);
	await seedPlayerStances(player.uid);

	console.log('▸ the admin opens the deliberations');
	const provisioned = await callable(
		'agoraProvisionCivicSessions',
		{ gameId: GAME_ID },
		admin.idToken,
	);
	check('one session opened', provisioned.sessions.length, 1);
	const { sessionId, code } = provisioned.sessions[0];

	const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
	const session = sessionSnap.data();
	check('marked civic', session.sessionMode, AgoraSessionMode.civic);
	check('opens at the deliberation', session.stage, AgoraStage.deliberation);
	check('carries no bell (never swept)', session.lessonEndsAt, undefined);
	check('remembers its island', session.civic?.islandStatementId, ISLAND_ID);

	console.log('▸ re-running is idempotent');
	const again = await callable('agoraProvisionCivicSessions', { gameId: GAME_ID }, admin.idToken);
	check('no second session', again.sessions.length, 0);
	check('reports the island as already open', again.alreadyOpen[0], ISLAND_ID);

	console.log('▸ the player walks through the gate');
	const handoff = await callable('odysseyMintAgoraHandoff', {}, player.idToken);
	check('token names the player', handoff.uid, player.uid);
	const arrived = await signInWithCustomToken(handoff.token);
	check('arrives as themselves, not a stranger', arrived.uid, player.uid);

	const joined = await callable('agoraJoinSession', { code }, arrived.idToken);
	check('joins the island’s session', joined.sessionId, sessionId);

	const participant = (
		await db
			.collection(Collections.agoraParticipants)
			.doc(createAgoraParticipantId(sessionId, player.uid))
			.get()
	).data();
	check('carried their position across', participant.campPosition, 100);
	check('and landed in a wing, not the centre', participant.camp, AgoraCamp.right);
	check('was given a name', typeof participant.anonName, 'string');

	console.log('▸ rejoining does not duplicate them');
	const rejoined = await callable('agoraJoinSession', { code }, arrived.idToken);
	check('same participant', rejoined.participantId, joined.participantId);

	console.log(
		failures === 0
			? '\n✓ the voyage reaches the square with its positions intact\n'
			: `\n✗ ${failures} check(s) failed\n`,
	);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
	console.error('\n✗ e2e-civic failed:', error.message);
	process.exit(1);
});
