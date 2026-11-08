/**
 * patch-party-descriptions — replaces the party descriptions on an EXISTING
 * live game doc with the player-facing copy in DEFAULT_PARTIES.
 *
 * The old descriptions were internal research notes ("מסלול על בסיס …",
 * "ראו שדה confidence בקובץ המחקר") and live in `odysseyGames/{id}.parties[]`.
 * This touches ONLY `description`, matched by `partyId`; scores, colours,
 * order, `enabled` and logos are left exactly as they are. Parties the code
 * does not know are skipped and reported.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless --apply is passed.
 *
 *   # look first (emulator or prod credentials, nothing is written)
 *   ODYSSEY_PROJECT_ID=wizcol-app GOOGLE_APPLICATION_CREDENTIALS=... \
 *     npx tsx apps/odyssey/scripts/patch-party-descriptions.ts --game default
 *
 *   # then write
 *   ODYSSEY_PROJECT_ID=wizcol-app GOOGLE_APPLICATION_CREDENTIALS=... \
 *     npx tsx apps/odyssey/scripts/patch-party-descriptions.ts --game default --apply
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { DEFAULT_PARTIES } from '../src/lib/defaults';

const PROJECT_ID = process.env.ODYSSEY_PROJECT_ID ?? 'freedi-test';
const FIRESTORE_HOST = process.env.ODYSSEY_FIRESTORE_HOST;

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);

	return index === -1 ? undefined : process.argv[index + 1];
}

const gameId = arg('game') ?? 'default';
const apply = process.argv.includes('--apply');

if (FIRESTORE_HOST) process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
const db: Firestore = getFirestore(app);

interface StoredParty {
	partyId: string;
	name: string;
	description?: string;
}

async function main(): Promise<void> {
	const gameSnap = await db.collection('odysseyGames').doc(gameId).get();
	const game = gameSnap.data();
	if (!game) throw new Error(`game "${gameId}" not found on ${FIRESTORE_HOST ?? PROJECT_ID}`);

	const wanted = new Map(DEFAULT_PARTIES.map((party) => [party.slug, party.description]));
	const stored = (game.parties ?? []) as StoredParty[];
	let changed = 0;

	const parties = stored.map((party) => {
		const description = wanted.get(party.partyId);
		if (description === undefined) {
			console.info(`  ? ${party.name} (${party.partyId}) — not in DEFAULT_PARTIES, left alone`);

			return party;
		}
		if (party.description === description) {
			console.info(`  = ${party.name} — already current`);

			return party;
		}
		changed += 1;
		console.info(`  ↻ ${party.name}\n      was: ${party.description ?? '(none)'}\n      now: ${description}`);

		return { ...party, description };
	});

	if (!apply) {
		console.info(`dry run — ${changed} description(s) would change on odysseyGames/${gameId}. Pass --apply to write.`);

		return;
	}
	if (changed === 0) {
		console.info('nothing to write');

		return;
	}

	await gameSnap.ref.update({ parties });
	console.info(`✓ updated ${changed} description(s) on odysseyGames/${gameId} on ${FIRESTORE_HOST ?? PROJECT_ID}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
