import {
	Collections,
	StatementType,
	createStatementObject,
	OdysseyGame,
	OdysseyIsland,
	OdysseyParty,
	OdysseyElder,
	ODYSSEY_DEFAULT_GAME_ID,
	User as FreediUser,
} from '@freedi/shared-types';
import { db, doc, writeBatch } from './firebase';
import {
	DEFAULT_COMPASS_QUESTIONS,
	DEFAULT_ISLANDS,
	DEFAULT_PARTIES,
	DEFAULT_TEXTS,
	DEFAULT_VALUES,
} from './defaults';
import { buildEldersFromDefaults } from './eldersDefaults';

/**
 * One-time game creation, run by the first admin from /admin.
 *
 * Builds the deliberative content as a standard Freedi statement tree —
 * root `question` → island `question`s → stance `option`s — via
 * createStatementObject so StatementSchema validation passes and the shared
 * consensus pipeline (cloud functions on evaluations) works on every stance.
 * The game-specific presentation layer goes into odysseyGames/{gameId}.
 */
export async function seedGame(
	creator: FreediUser,
	gameId: string = ODYSSEY_DEFAULT_GAME_ID,
): Promise<OdysseyGame> {
	const batch = writeBatch(db);
	const now = Date.now();

	const root = createStatementObject({
		statement: DEFAULT_TEXTS.gameTitle,
		statementType: StatementType.question,
		parentId: 'top',
		creatorId: creator.uid,
		creator,
	});
	if (!root) throw new Error('Root statement failed validation');
	batch.set(doc(db, Collections.statements, root.statementId), root);

	const islandsMeta: OdysseyIsland[] = [];
	/** island slug → stance statementIds in stance order (for party positions) */
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
		batch.set(doc(db, Collections.statements, islandStatement.statementId), {
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
			batch.set(doc(db, Collections.statements, stance.statementId), {
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
		});
	});

	const islandIdBySlug = new Map(
		DEFAULT_ISLANDS.map((island, index) => [island.slug, islandsMeta[index].statementId]),
	);

	const parties: OdysseyParty[] = DEFAULT_PARTIES.map((party, index) => {
		const positions: Record<string, string> = {};
		for (const [slug, stanceIndex] of Object.entries(party.positions)) {
			const islandId = islandIdBySlug.get(slug);
			const stanceId = stanceIdsBySlug.get(slug)?.[stanceIndex - 1];
			if (islandId && stanceId) positions[islandId] = stanceId;
		}

		return {
			partyId: party.slug,
			name: party.name,
			color: party.color,
			imageUrl: null,
			description: party.description,
			positions,
			sortOrder: index + 1,
			enabled: true,
		};
	});

	const elders: OdysseyElder[] = buildEldersFromDefaults({
		islandIdBySlug,
		stanceIdsBySlug,
		titleBySlug: new Map(DEFAULT_ISLANDS.map((island) => [island.slug, island.title])),
	});

	const game: OdysseyGame = {
		gameId,
		rootStatementId: root.statementId,
		texts: { ...DEFAULT_TEXTS },
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
		elders,
		adminUids: [creator.uid],
		creatorId: creator.uid,
		createdAt: now,
		lastUpdate: now,
	};

	batch.set(doc(db, Collections.odysseyGames, gameId), game);
	await batch.commit();

	return game;
}
