/**
 * patch-elders — puts the current crew onto an EXISTING live game doc.
 *
 * `DEFAULT_ELDERS` is seed content: it is read once, when a game is created,
 * and never again. A game seeded when the crew was three keeps three elders
 * forever, no matter what the source says — which is why adding nine sailors
 * to the code changed nothing on a running game. Reseeding is not the fix:
 * it mints new statement ids and orphans every evaluation already collected.
 *
 * So this script rebuilds `game.elders` from `DEFAULT_ELDERS` against the
 * game's OWN island and stance ids, and writes only that field.
 *
 * What it preserves, because the organizer may have changed it in /admin:
 *   - `enabled` on an elder that already exists (a switched-off elder stays off)
 *   - `portraitUrl` (art the game may already carry)
 * Everything else — positions, reactions, challenges, values, years — is
 * refreshed from source, since that is the point of running it.
 *
 * Island slugs are not persisted, so the mapping is defensive, exactly as in
 * patch-party-attitudes: an island is located by its DEFAULT_ISLANDS position
 * (sortOrder) AND its title, and any mismatch aborts loudly rather than
 * writing Herzl's course onto the wrong island.
 *
 *   # look first, always
 *   ODYSSEY_FIRESTORE_HOST=localhost:8081 \
 *     npx tsx apps/odyssey/scripts/patch-elders.ts --game default --dry-run
 *
 *   # production: no emulator host, real credentials
 *   ODYSSEY_PROJECT_ID=wizcol-app GOOGLE_APPLICATION_CREDENTIALS=... \
 *     npx tsx apps/odyssey/scripts/patch-elders.ts --game default
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { DEFAULT_ISLANDS } from '../src/lib/defaults';
import { DEFAULT_ELDERS, buildEldersFromDefaults } from '../src/lib/eldersDefaults';

const PROJECT_ID = process.env.ODYSSEY_PROJECT_ID ?? 'freedi-test';
const FIRESTORE_HOST = process.env.ODYSSEY_FIRESTORE_HOST;

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);

	return index === -1 ? undefined : process.argv[index + 1];
}

const gameId = arg('game') ?? 'default';
const dryRun = process.argv.includes('--dry-run');

if (FIRESTORE_HOST) process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
const db: Firestore = getFirestore(app);

interface GameIsland {
	statementId: string;
	title: string;
	sortOrder: number;
}

interface StoredElder {
	elderId: string;
	name: string;
	enabled?: boolean;
	portraitUrl?: string | null;
}

async function main(): Promise<void> {
	const gameSnap = await db.collection('odysseyGames').doc(gameId).get();
	const game = gameSnap.data();
	if (!game) throw new Error(`game "${gameId}" not found on ${FIRESTORE_HOST ?? PROJECT_ID}`);

	const gameIslands = (game.islands ?? []) as GameIsland[];
	const existing = (game.elders ?? []) as StoredElder[];
	console.info(
		`game "${gameId}": ${gameIslands.length} islands, ${existing.length} elders on board ` +
			`(${existing.map((elder) => elder.elderId).join(', ') || 'none'})`,
	);

	// Every island an elder charts must resolve, or the course is meaningless.
	const slugs = [...new Set(DEFAULT_ELDERS.flatMap((elder) => Object.keys(elder.positions)))];
	const islandIdBySlug = new Map<string, string>();
	const stanceIdsBySlug = new Map<string, string[]>();
	const titleBySlug = new Map<string, string>();

	for (const slug of slugs) {
		const defaultIndex = DEFAULT_ISLANDS.findIndex((island) => island.slug === slug);
		if (defaultIndex === -1) throw new Error(`elder charts "${slug}", which is not a default island`);
		const defaultIsland = DEFAULT_ISLANDS[defaultIndex];
		const gameIsland = gameIslands.find(
			(island) => island.sortOrder === defaultIndex + 1 && island.title === defaultIsland.title,
		);
		if (!gameIsland) {
			throw new Error(
				`island "${slug}" (${defaultIsland.title}) not found at sortOrder ${defaultIndex + 1} — ` +
					'the game doc diverged from DEFAULT_ISLANDS (reordered or renamed); refusing to guess',
			);
		}

		const stancesSnap = await db
			.collection('statements')
			.where('parentId', '==', gameIsland.statementId)
			.get();
		const stances = stancesSnap.docs
			.map(
				(docSnap) =>
					docSnap.data() as { statementId: string; statementType: string; order?: number },
			)
			.filter((statement) => statement.statementType === 'option')
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		if (stances.length !== defaultIsland.stances.length) {
			throw new Error(
				`island "${slug}": live doc has ${stances.length} stances, ` +
					`DEFAULT_ISLANDS expects ${defaultIsland.stances.length}`,
			);
		}

		islandIdBySlug.set(slug, gameIsland.statementId);
		stanceIdsBySlug.set(
			slug,
			stances.map((stance) => stance.statementId),
		);
		titleBySlug.set(slug, gameIsland.title);
	}

	const rebuilt = buildEldersFromDefaults({ islandIdBySlug, stanceIdsBySlug, titleBySlug });

	// An organizer's choices in /admin outlive a content refresh.
	const previous = new Map(existing.map((elder) => [elder.elderId, elder]));
	const elders = rebuilt.map((elder) => {
		const before = previous.get(elder.elderId);
		if (!before) return elder;

		return {
			...elder,
			enabled: before.enabled ?? elder.enabled,
			portraitUrl: before.portraitUrl ?? elder.portraitUrl,
		};
	});

	for (const elder of elders) {
		const before = previous.get(elder.elderId);
		const islands = Object.keys(elder.positions).length;
		console.info(
			`  ${before ? '↻' : '+'} ${elder.name} (${elder.years ?? '—'}) — ` +
				`${islands} islands${elder.enabled ? '' : ', DISABLED (kept from /admin)'}`,
		);
	}
	const dropped = existing.filter(
		(elder) => !elders.some((next) => next.elderId === elder.elderId),
	);
	for (const elder of dropped) {
		// Loud, because it means a persona the organizer may have edited is going
		// away — nothing here writes over a name it did not recognise silently.
		console.info(`  − ${elder.name} (${elder.elderId}) — no longer in DEFAULT_ELDERS, REMOVED`);
	}

	if (dryRun) {
		console.info(`dry run — would write ${elders.length} elders to odysseyGames/${gameId}`);

		return;
	}

	await gameSnap.ref.update({ elders, lastUpdate: Date.now() });
	console.info(
		`✓ wrote ${elders.length} elders to odysseyGames/${gameId} on ${FIRESTORE_HOST ?? PROJECT_ID}`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
