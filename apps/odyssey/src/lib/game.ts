import {
	Collections,
	Statement,
	StatementType,
	OdysseyGame,
	OdysseyIsland,
	ODYSSEY_DEFAULT_GAME_ID,
} from '@freedi/shared-types';
import { collection, db, doc, getDoc, getDocs, query, where } from './firebase';

/**
 * Loading the game = the config doc + the statement tree.
 *
 * Islands are `question` Statements and stances are `option` Statements, all
 * descendants of the game's root statement, fetched with one
 * 'parents' array-contains query — the standard Freedi tree pattern.
 */

export interface IslandContent extends OdysseyIsland {
	/** The island's `question` Statement (text = the central question) */
	statement: Statement;
	/** The island's stances, sorted by `order` */
	stances: Statement[];
}

export interface GameContent {
	game: OdysseyGame;
	islands: IslandContent[];
}

export async function loadGame(
	gameId: string = ODYSSEY_DEFAULT_GAME_ID,
): Promise<GameContent | null> {
	const gameSnap = await getDoc(doc(db, Collections.odysseyGames, gameId));
	if (!gameSnap.exists()) return null;

	const game = gameSnap.data() as OdysseyGame;

	const descendantsSnap = await getDocs(
		query(
			collection(db, Collections.statements),
			where('parents', 'array-contains', game.rootStatementId),
		),
	);
	const statements = descendantsSnap.docs.map((d) => d.data() as Statement);
	const byId = new Map(statements.map((s) => [s.statementId, s]));

	const islands: IslandContent[] = [];
	for (const meta of [...game.islands].sort((a, b) => a.sortOrder - b.sortOrder)) {
		const statement = byId.get(meta.statementId);
		if (!statement) continue;
		const stances = statements
			.filter(
				(s) =>
					s.parentId === meta.statementId && s.statementType === StatementType.option && !s.hide,
			)
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		islands.push({ ...meta, statement, stances });
	}

	return { game, islands };
}

/** Convenience: all visible islands, respecting the enabled flag. */
export function enabledIslands(content: GameContent): IslandContent[] {
	return content.islands.filter((island) => island.enabled);
}

export function isGameAdmin(game: OdysseyGame, uid: string | undefined): boolean {
	if (!uid) return false;

	return game.creatorId === uid || game.adminUids.includes(uid);
}
