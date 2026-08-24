/**
 * seed — a playable Odyssey game whose islands open onto the Agora.
 *
 * The app itself can only be seeded from /admin by a signed-in admin, which is
 * fine for a demo day and useless for a local run: it needs a Google popup, a
 * dozen anchor dropdowns and a provisioning click before a single island has a
 * gate. This script does the same work headlessly and, crucially, does the two
 * things the create-game action leaves to the admin — it designates each
 * island's two poles and it opens the deliberations — so the round trip
 * Odyssey → Agora → Odyssey is walkable the moment it finishes.
 *
 * Runs against the emulators (the same ones apps/agora hardcodes).
 *
 *   npx tsx apps/odyssey/scripts/seed.ts
 *   npx tsx apps/odyssey/scripts/seed.ts --admin me@example.com
 */
import { createRequire } from 'node:module';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
	DEFAULT_COMPASS_QUESTIONS,
	DEFAULT_ISLANDS,
	DEFAULT_PARTIES,
	DEFAULT_TEXTS,
	DEFAULT_VALUES,
} from '../src/lib/defaults';
import { researchedAttitudes } from '../src/lib/research';

const require = createRequire(import.meta.url);
const {
	Collections,
	StatementType,
	createStatementObject,
	ODYSSEY_DEFAULT_GAME_ID,
	ODYSSEY_EVENT_SCRIPT,
	// eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('@freedi/shared-types');

const PROJECT_ID = process.env.ODYSSEY_PROJECT_ID ?? 'freedi-test';
const REGION = 'me-west1';
const AUTH_HOST = process.env.ODYSSEY_AUTH_HOST ?? 'http://localhost:9099';
const FIRESTORE_HOST = process.env.ODYSSEY_FIRESTORE_HOST ?? 'localhost:8081';
const FUNCTIONS_HOST = process.env.ODYSSEY_FUNCTIONS_HOST ?? 'http://localhost:5001';
const AGORA_ORIGIN = process.env.ODYSSEY_AGORA_ORIGIN ?? 'http://localhost:3009';

const IDENTITY = `${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;
const FUNCTIONS_BASE = `${FUNCTIONS_HOST}/${PROJECT_ID}/${REGION}`;

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);

	return index === -1 ? undefined : process.argv[index + 1];
}

const adminEmail = arg('admin') ?? 'tal.yaron@gmail.com';

/**
 * Which game document to build.
 *
 * One event is one game, so seeding a second one is how you get two events
 * side by side — the app reaches them at `?game=<id>`.
 */
const gameId = arg('game') ?? ODYSSEY_DEFAULT_GAME_ID;

/**
 * The script the squares open with. `--script event` is the camp-less preset;
 * omitted means no script at all, which is the legacy civic behaviour and the
 * thing every change here has to leave untouched.
 */
const script = arg('script') === 'event' ? ODYSSEY_EVENT_SCRIPT : undefined;

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);

/**
 * Sign in the admin the way the browser will.
 *
 * The uid has to be the SAME one the account picker hands out later, or the
 * seeded game would list an admin who can never log in as themselves. The auth
 * emulator keys a Google identity on `sub`, so deriving it from the email is
 * what makes the two paths meet.
 */
async function signInGoogle(email: string): Promise<{ uid: string; idToken: string }> {
	const res = await fetch(`${IDENTITY}/accounts:signInWithIdp?key=fake`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			postBody: `id_token=${encodeURIComponent(
				JSON.stringify({ sub: email, email, name: email.split('@')[0] }),
			)}&providerId=google.com`,
			requestUri: 'http://localhost',
			returnSecureToken: true,
		}),
	});
	const json = (await res.json()) as { idToken?: string; localId?: string };
	if (!json.idToken || !json.localId) throw new Error(`Google sign-in failed for ${email}`);

	return { uid: json.localId, idToken: json.idToken };
}

async function callable<T>(name: string, data: unknown, token: string): Promise<T> {
	const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ data }),
		// The functions emulator cold-starts the whole bundle on the first call.
		signal: AbortSignal.timeout(180_000),
	});
	const json = (await res.json()) as { result?: T; error?: { status?: string; message?: string } };
	if (json.error) {
		throw new Error(`${name} failed: ${json.error.status ?? ''} ${json.error.message ?? ''}`.trim());
	}
	if (json.result === undefined) throw new Error(`${name} returned no result (HTTP ${res.status})`);

	return json.result;
}

/** Re-running must not leave the last run's islands floating under a dead root. */
async function clearPreviousTree(): Promise<void> {
	const previous = await db.collection(Collections.odysseyGames).doc(gameId).get();
	if (!previous.exists) return;

	const root = previous.data()?.rootStatementId;
	if (!root) return;

	const stale = await db.collection(Collections.statements).where('topParentId', '==', root).get();
	const batch = db.batch();
	stale.docs.forEach((docSnap) => batch.delete(docSnap.ref));
	batch.delete(db.collection(Collections.statements).doc(root));
	await batch.commit();
	console.log(`  cleared ${stale.size + 1} statements from the previous game`);
}

async function main(): Promise<void> {
	console.log(`\n▸ signing in the admin (${adminEmail})`);
	const admin = await signInGoogle(adminEmail);
	const creator = {
		uid: admin.uid,
		displayName: adminEmail.split('@')[0],
		email: adminEmail,
		photoURL: '',
		isAnonymous: false,
	};

	console.log('▸ clearing any previous game tree');
	await clearPreviousTree();

	console.log('▸ building the statement tree');
	const now = Date.now();
	const batch = db.batch();

	const root = createStatementObject({
		statement: DEFAULT_TEXTS.gameTitle,
		statementType: StatementType.question,
		parentId: 'top',
		creatorId: creator.uid,
		creator,
	});
	if (!root) throw new Error('Root statement failed validation');
	batch.set(db.collection(Collections.statements).doc(root.statementId), root);

	const islandsMeta: Record<string, unknown>[] = [];
	const stanceIdsBySlug = new Map<string, string[]>();

	DEFAULT_ISLANDS.forEach((island, islandIndex) => {
		const islandStatement = createStatementObject({
			statement: island.centralQuestion,
			statementType: StatementType.question,
			parentId: root.statementId,
			topParentId: root.statementId,
			creatorId: creator.uid,
			creator,
		});
		if (!islandStatement) throw new Error(`Island failed: ${island.slug}`);
		batch.set(db.collection(Collections.statements).doc(islandStatement.statementId), {
			...islandStatement,
			order: islandIndex + 1,
		});

		const stanceIds: string[] = [];
		island.stances.forEach((stanceText, stanceIndex) => {
			const stance = createStatementObject({
				statement: stanceText,
				statementType: StatementType.option,
				parentId: islandStatement.statementId,
				topParentId: root.statementId,
				parents: [root.statementId, islandStatement.statementId],
				creatorId: creator.uid,
				creator,
			});
			if (!stance) throw new Error(`Stance failed: ${island.slug}#${stanceIndex}`);
			batch.set(db.collection(Collections.statements).doc(stance.statementId), {
				...stance,
				order: stanceIndex + 1,
			});
			stanceIds.push(stance.statementId);
		});
		stanceIdsBySlug.set(island.slug, stanceIds);

		islandsMeta.push({
			statementId: islandStatement.statementId,
			title: island.title,
			issue: island.issue,
			shortExplain: island.shortExplain,
			opening: island.opening,
			depthQuestion: island.depthQuestion,
			imageUrl: null,
			posX: island.posX,
			posY: island.posY,
			sortOrder: islandIndex + 1,
			enabled: true,
			// The poles the admin would otherwise pick by hand. First and last
			// stance are the ones the design lists as furthest apart; anchoring
			// anything closer would land every player in the centre, where
			// bridging has nothing to bridge.
			leftAnchorStanceId: stanceIds[0] ?? null,
			rightAnchorStanceId: stanceIds[stanceIds.length - 1] ?? null,
		});
	});

	const islandIdBySlug = new Map(
		DEFAULT_ISLANDS.map((island, index) => [
			island.slug,
			islandsMeta[index].statementId as string,
		]),
	);

	const researched = researchedAttitudes();
	const parties = DEFAULT_PARTIES.map((party, index) => {
		const partyResearch = researched[party.slug] ?? {};
		const positions: Record<string, string> = {};
		for (const [slug, stanceIndex] of Object.entries(party.positions)) {
			if (partyResearch[slug]) continue; // researched islands drop the legacy entry
			const islandId = islandIdBySlug.get(slug);
			const stanceId = stanceIdsBySlug.get(slug)?.[(stanceIndex as number) - 1];
			if (islandId && stanceId) positions[islandId] = stanceId;
		}
		const attitudes: Record<string, number> = {};
		for (const [slug, scores] of Object.entries(partyResearch)) {
			const stanceIds = stanceIdsBySlug.get(slug) ?? [];
			scores.forEach((score, scoreIndex) => {
				const stanceId = stanceIds[scoreIndex];
				if (stanceId) attitudes[stanceId] = score;
			});
		}

		return {
			partyId: party.slug,
			name: party.name,
			color: party.color,
			imageUrl: null,
			description: party.description,
			attitudes,
			positions,
			sortOrder: index + 1,
			enabled: true,
		};
	});

	const game = {
		gameId,
		...(script ? { script } : {}),
		rootStatementId: root.statementId,
		// The gate link is built from this; empty means the summary shows no way on.
		texts: { ...DEFAULT_TEXTS, agoraOrigin: AGORA_ORIGIN },
		compassQuestions: DEFAULT_COMPASS_QUESTIONS.map((question, index) => ({
			questionId: question.slug,
			title: question.title,
			prompt: question.prompt,
			chips: question.chips,
			sortOrder: index + 1,
			enabled: true,
		})),
		values: DEFAULT_VALUES.map((label, index) => ({
			valueId: `value-${index + 1}`,
			label,
			sortOrder: index + 1,
			enabled: true,
		})),
		islands: islandsMeta,
		parties,
		adminUids: [creator.uid],
		creatorId: creator.uid,
		createdAt: now,
		lastUpdate: now,
	};

	batch.set(db.collection(Collections.odysseyGames).doc(gameId), game);
	await batch.commit();
	console.log(
		`  ${islandsMeta.length} islands, ${parties.length} parties, root ${root.statementId}`,
	);

	console.log('▸ opening a civic deliberation for every island');
	const provisioned = await callable<{ sessions: { code: string; islandStatementId: string }[] }>(
		'agoraProvisionCivicSessions',
		{ gameId },
		admin.idToken,
	);
	console.log(`  ${provisioned.sessions.length} squares open`);

	const query = gameId === ODYSSEY_DEFAULT_GAME_ID ? '' : `?game=${gameId}`;
	console.log(`\n✓ seeded "${gameId}" (${script ? 'event script' : 'classic'}). Play it:`);
	console.log(`    Odyssey  http://localhost:3010/${query}`);
	console.log(`    Admin    http://localhost:3010/admin${query}`);
	console.log(`    Agora    ${AGORA_ORIGIN}/#!/join/${provisioned.sessions[0]?.code ?? '<code>'}`);
	console.log(`    admin account in the emulator picker: ${adminEmail}\n`);
}

main().catch((error) => {
	console.error('\n✗ seed failed:', error.message);
	process.exit(1);
});
