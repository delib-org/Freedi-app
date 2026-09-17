/**
 * patch-parties — puts the current ballot onto an EXISTING live game doc.
 *
 * `DEFAULT_PARTIES` is seed content: read once, when a game is created, and
 * never again. So a party that folded still sails on every running game, and
 * a party founded three weeks before the election never appears on one —
 * which is precisely the thing the map exists not to do.
 *
 * `patch-party-attitudes` cannot fix that: it walks the parties ALREADY in the
 * game doc and refreshes their scores, so a party the doc has never heard of
 * is invisible to it and a party the research has dropped is merely skipped.
 * This script rebuilds `game.parties` itself — the roster — from
 * DEFAULT_PARTIES and the research file, against the game's OWN island and
 * stance ids. Run this first, then patch-party-attitudes if you want its
 * per-stance report.
 *
 * Reseeding is not the alternative: it mints new statement ids and orphans
 * every evaluation already collected.
 *
 * What it preserves, because the organizer may have set it in /admin:
 *   - `enabled` on a party that already exists (a party switched off stays off)
 *   - `imageUrl` (a logo the game may already carry)
 * Everything else — name, colour, description, attitudes, positions, order —
 * is refreshed from source, since that is the point of running it.
 *
 * A party that disappears from DEFAULT_PARTIES is REMOVED from the doc, and
 * the run says so by name. Evaluations are never touched: parties carry no
 * player data, only the route the ship sails.
 *
 * Island slugs are not persisted, so the mapping is defensive, exactly as in
 * patch-elders and patch-party-attitudes: an island is located by its
 * DEFAULT_ISLANDS position (sortOrder) AND its title, and any mismatch aborts
 * loudly rather than writing one party's course onto another island.
 *
 *   # look first, always
 *   ODYSSEY_FIRESTORE_HOST=localhost:8081 \
 *     npx tsx apps/odyssey/scripts/patch-parties.ts --game default --dry-run
 *
 *   # production: no emulator host, real credentials
 *   ODYSSEY_PROJECT_ID=wizcol-app GOOGLE_APPLICATION_CREDENTIALS=... \
 *     npx tsx apps/odyssey/scripts/patch-parties.ts --game default
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { DEFAULT_ISLANDS, DEFAULT_PARTIES } from '../src/lib/defaults';
import { researchedAttitudes } from '../src/lib/research';

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

interface StoredParty {
	partyId: string;
	name: string;
	enabled?: boolean;
	imageUrl?: string | null;
}

async function main(): Promise<void> {
	const gameSnap = await db.collection('odysseyGames').doc(gameId).get();
	const game = gameSnap.data();
	if (!game) throw new Error(`game "${gameId}" not found on ${FIRESTORE_HOST ?? PROJECT_ID}`);

	const gameIslands = (game.islands ?? []) as GameIsland[];
	const existing = (game.parties ?? []) as StoredParty[];
	console.info(
		`game "${gameId}": ${gameIslands.length} islands, ${existing.length} parties on the water ` +
			`(${existing.map((party) => party.partyId).join(', ') || 'none'})`,
	);

	// Every island any party has a course on must resolve, or the course means
	// nothing. That is the union of the legacy `positions` and the research.
	const researched = researchedAttitudes();
	const slugs = [
		...new Set([
			...DEFAULT_PARTIES.flatMap((party) => Object.keys(party.positions)),
			...Object.values(researched).flatMap((byIsland) => Object.keys(byIsland)),
		]),
	];

	const islandIdBySlug = new Map<string, string>();
	const stanceIdsBySlug = new Map<string, string[]>();

	for (const slug of slugs) {
		const defaultIndex = DEFAULT_ISLANDS.findIndex((island) => island.slug === slug);
		if (defaultIndex === -1) {
			throw new Error(`a party has a course on "${slug}", which is not a default island`);
		}
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
	}

	// Built exactly as seed.ts builds them, so a patched game and a fresh one
	// are the same game.
	const previous = new Map(existing.map((party) => [party.partyId, party]));
	const parties = DEFAULT_PARTIES.map((party, index) => {
		const partyResearch = researched[party.slug] ?? {};

		const positions: Record<string, string> = {};
		for (const [slug, stanceIndex] of Object.entries(party.positions)) {
			if (partyResearch[slug]) continue; // researched islands drop the legacy entry
			const islandId = islandIdBySlug.get(slug);
			const stanceId = stanceIdsBySlug.get(slug)?.[stanceIndex - 1];
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

		const before = previous.get(party.slug);

		return {
			partyId: party.slug,
			name: party.name,
			color: party.color,
			imageUrl: before?.imageUrl ?? null,
			description: party.description,
			attitudes,
			positions,
			sortOrder: index + 1,
			enabled: before?.enabled ?? true,
		};
	});

	const keeping = new Set(parties.map((party) => party.partyId));
	const dropped = existing.filter((party) => !keeping.has(party.partyId));

	for (const party of parties) {
		const before = previous.get(party.partyId);
		const mark = before ? '↻' : '+';
		const scored = Object.keys(party.attitudes).length;
		const legacy = Object.keys(party.positions).length;
		console.info(
			`  ${mark} ${party.name} — ${scored} researched stance scores` +
				(legacy > 0 ? `, ${legacy} island(s) on the legacy route` : '') +
				(party.enabled ? '' : ' (switched off, kept off)'),
		);
	}
	for (const party of dropped) {
		console.info(`  − ${party.name} (${party.partyId}) — off the ballot, removed from the game`);
	}

	if (dryRun) {
		console.info(
			`dry run — would write ${parties.length} parties to odysseyGames/${gameId}` +
				(dropped.length > 0 ? ` and remove ${dropped.length}` : ''),
		);

		return;
	}

	await gameSnap.ref.update({ parties });
	console.info(
		`✓ wrote ${parties.length} parties to odysseyGames/${gameId} on ` +
			`${FIRESTORE_HOST ?? PROJECT_ID}` +
			(dropped.length > 0 ? ` (${dropped.length} removed)` : ''),
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
