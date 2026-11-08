/**
 * audit-live-game — READ-ONLY. Backs up a live Odyssey game's party roster and
 * island/stance statements to a JSON file, and compares the live island titles,
 * stance texts and stance order with DEFAULT_ISLANDS. Writes nothing to Firestore.
 *
 * Run it BEFORE any party-attitude patch: the research file is keyed by the
 * code's wording, and `patch-party-attitudes` maps scores by stance order.
 *
 *   ODYSSEY_PROJECT_ID=wizcol-app npx tsx apps/odyssey/scripts/audit-live-game.ts \
 *     --game default --out /path/to/backup.json
 *
 * Uses Application Default Credentials; no emulator host is set.
 */
import { writeFileSync } from 'node:fs';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_ISLANDS } from '../src/lib/defaults';

const PROJECT_ID = process.env.ODYSSEY_PROJECT_ID ?? 'freedi-test';

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);

	return index === -1 ? undefined : process.argv[index + 1];
}

interface LiveIsland {
	statementId: string;
	title: string;
	sortOrder: number;
}

interface LiveStance {
	statementId: string;
	statement: string;
	statementType: string;
	order?: number;
}

async function main(): Promise<void> {
	const gameId = arg('game') ?? 'default';
	const out = arg('out');
	const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
	const db = getFirestore(app);

	const gameSnap = await db.collection('odysseyGames').doc(gameId).get();
	const game = gameSnap.data();
	if (!game) throw new Error(`game "${gameId}" not found in ${PROJECT_ID}`);

	const islands = (game.islands as LiveIsland[]).slice().sort((a, b) => a.sortOrder - b.sortOrder);
	const backup: Record<string, unknown> = {
		projectId: PROJECT_ID,
		gameId,
		exportedAt: Date.now(),
		parties: game.parties,
		islands: [],
	};
	const mismatches: string[] = [];

	for (const live of islands) {
		const stancesSnap = await db.collection('statements').where('parentId', '==', live.statementId).get();
		const stances = stancesSnap.docs
			.map((docSnap) => docSnap.data() as LiveStance)
			.filter((statement) => statement.statementType === 'option')
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		(backup.islands as unknown[]).push({ ...live, stances });

		const expected = DEFAULT_ISLANDS[live.sortOrder - 1];
		if (!expected) {
			mismatches.push(`live island ${live.sortOrder} "${live.title}" has no counterpart in code`);
			continue;
		}
		if (expected.title !== live.title) {
			mismatches.push(`island ${live.sortOrder}: live "${live.title}" vs code "${expected.title}"`);
		}
		if (stances.length !== expected.stances.length) {
			mismatches.push(
				`island ${live.sortOrder}: live ${stances.length} stances vs code ${expected.stances.length}`,
			);
		}
		expected.stances.forEach((codeStance, index) => {
			const liveText = stances[index]?.statement;
			if (liveText !== codeStance) {
				mismatches.push(`island ${live.sortOrder} stance ${index + 1}: live "${liveText}" vs code "${codeStance}"`);
			}
		});
	}

	console.info(`project ${PROJECT_ID} game ${gameId}: ${islands.length} islands, ${(game.parties as unknown[]).length} parties`);
	console.info(mismatches.length === 0 ? 'OK: titles, stance texts and order match the code' : `MISMATCHES (${mismatches.length}):`);
	mismatches.forEach((line) => console.info(`  - ${line}`));
	if (out) {
		writeFileSync(out, JSON.stringify(backup, null, 2));
		console.info(`backup written to ${out}`);
	}
	process.exit(mismatches.length === 0 ? 0 : 1);
}

main().catch((error) => {
	console.error('audit-live-game failed:', error);
	process.exit(2);
});
