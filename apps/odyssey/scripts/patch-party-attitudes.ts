/**
 * patch-party-attitudes — applies the researched continuous scores to an
 * EXISTING live game doc, without reseeding (reseeding mints new statement
 * ids and would orphan every evaluation already collected).
 *
 * Island slugs are not persisted, so the mapping is defensive: a researched
 * island is located in the game doc by its DEFAULT_ISLANDS position
 * (sortOrder) AND its title — any mismatch aborts loudly rather than
 * writing scores onto the wrong island. Stances map by their `order` field,
 * exactly as the app reads them (game.ts sorts by order).
 *
 *   ODYSSEY_FIRESTORE_HOST=localhost:8181 \
 *     npx tsx apps/odyssey/scripts/patch-party-attitudes.ts --game default --dry-run
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_ISLANDS } from '../src/lib/defaults';
import { partyStanceResearch } from '../src/lib/research';

const PROJECT_ID = process.env.ODYSSEY_PROJECT_ID ?? 'freedi-test';
const FIRESTORE_HOST = process.env.ODYSSEY_FIRESTORE_HOST ?? 'localhost:8081';

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);

	return index === -1 ? undefined : process.argv[index + 1];
}

const gameId = arg('game') ?? 'default';
const dryRun = process.argv.includes('--dry-run');

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);

interface GameIsland {
	statementId: string;
	title: string;
	sortOrder: number;
}

interface GameParty {
	partyId: string;
	name: string;
	attitudes?: Record<string, number>;
	positions?: Record<string, string>;
}

async function main(): Promise<void> {
	const research = partyStanceResearch();
	const researchedSlugs = Object.keys(research.islands);
	if (researchedSlugs.length === 0) {
		console.info('research file has no islands — nothing to patch');

		return;
	}

	const gameSnap = await db.collection('odysseyGames').doc(gameId).get();
	const game = gameSnap.data();
	if (!game) throw new Error(`game "${gameId}" not found on ${FIRESTORE_HOST}`);

	const gameIslands = game.islands as GameIsland[];
	const parties = game.parties as GameParty[];

	// islandSlug → the matching live island + its ordered stance statementIds.
	// Default islands are located by DEFAULT_ISLANDS position + title; admin-added
	// islands resolve through research.islandMeta (statementId when recorded,
	// unique title otherwise).
	const islandMeta = research.islandMeta ?? {};
	const stanceIdsBySlug = new Map<string, string[]>();
	const gameIslandBySlug = new Map<string, GameIsland>();
	for (const slug of researchedSlugs) {
		const defaultIndex = DEFAULT_ISLANDS.findIndex((island) => island.slug === slug);
		let gameIsland: GameIsland | undefined;
		let expectedStances: number;

		if (defaultIndex !== -1) {
			const defaultIsland = DEFAULT_ISLANDS[defaultIndex];
			expectedStances = defaultIsland.stances.length;
			gameIsland = gameIslands.find(
				(island) => island.sortOrder === defaultIndex + 1 && island.title === defaultIsland.title,
			);
			if (!gameIsland) {
				throw new Error(
					`island "${slug}" (${defaultIsland.title}) not found at sortOrder ${defaultIndex + 1} — ` +
						'the game doc diverged from DEFAULT_ISLANDS (reordered or renamed); refusing to guess',
				);
			}
		} else {
			const meta = islandMeta[slug];
			if (!meta) throw new Error(`island "${slug}" is neither a default island nor in islandMeta`);
			expectedStances = meta.stances.length;
			gameIsland = meta.statementId
				? gameIslands.find((island) => island.statementId === meta.statementId)
				: undefined;
			if (gameIsland && gameIsland.title !== meta.title) {
				throw new Error(
					`island "${slug}": live island ${gameIsland.statementId} is titled "${gameIsland.title}", ` +
						`islandMeta says "${meta.title}" — refusing to guess`,
				);
			}
			if (!gameIsland) {
				const byTitle = gameIslands.filter((island) => island.title === meta.title);
				if (byTitle.length !== 1) {
					throw new Error(
						`island "${slug}": ${byTitle.length} live islands titled "${meta.title}" — ` +
							'record its statementId in islandMeta',
					);
				}
				gameIsland = byTitle[0];
			}
		}

		const stancesSnap = await db
			.collection('statements')
			.where('parentId', '==', gameIsland.statementId)
			.get();
		const stances = stancesSnap.docs
			.map((docSnap) => docSnap.data() as { statementId: string; statementType: string; order?: number })
			.filter((statement) => statement.statementType === 'option')
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		if (stances.length !== expectedStances) {
			throw new Error(
				`island "${slug}": live doc has ${stances.length} stances, research expects ${expectedStances}`,
			);
		}
		gameIslandBySlug.set(slug, gameIsland);
		stanceIdsBySlug.set(slug, stances.map((stance) => stance.statementId));
	}

	let changes = 0;
	for (const party of parties) {
		for (const slug of researchedSlugs) {
			const entries = research.islands[slug][party.partyId];
			if (!entries) {
				console.info(`  ⚠ ${slug}: no research for party "${party.partyId}" — skipped`);
				continue;
			}
			const stanceIds = stanceIdsBySlug.get(slug) as string[];
			const attitudes = { ...(party.attitudes ?? {}) };
			entries.forEach((entry, index) => {
				attitudes[stanceIds[index]] = entry.score;
				changes += 1;
			});
			party.attitudes = attitudes;

			// The researched island's legacy declared stance is superseded.
			const gameIsland = gameIslandBySlug.get(slug);
			if (gameIsland && party.positions?.[gameIsland.statementId]) {
				delete party.positions[gameIsland.statementId];
			}

			console.info(
				`  ${party.name} @ ${slug}: [${entries.map((entry) => entry.score).join(', ')}]`,
			);
		}
	}

	if (dryRun) {
		console.info(`dry run — would write ${changes} scores across ${parties.length} parties`);

		return;
	}

	await gameSnap.ref.update({ parties, lastUpdate: Date.now() });
	console.info(`✓ wrote ${changes} scores to odysseyGames/${gameId} on ${FIRESTORE_HOST}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
