import { createHash } from 'node:crypto';
import { StatementType } from '@freedi/shared-types';
import type { OdysseyElder, OdysseyGame, Statement } from '@freedi/shared-types';

/**
 * Everything in a game that is prose, flattened to (path, Hebrew) pairs.
 *
 * A path names one translatable field — `islands/<id>/title`,
 * `compassQuestions/<id>/chips/2`, `elders/<id>/counsel/<island>/<stance>` —
 * and is the key the model sees, the key its answer comes back under, the
 * key the translation doc is assembled from, and the key the source hash is
 * stored under. One name per field end to end: nothing is matched by text.
 */

export interface TranslationItem {
	path: string;
	text: string;
}

/** The speaker of a chunk, so the model keeps the voice. */
export interface TranslationVoice {
	name: string;
	role: string;
	bio: string;
}

export interface TranslationChunk {
	chunkId: string;
	voice?: TranslationVoice;
	items: TranslationItem[];
}

/**
 * Screen-text keys that are configuration, not prose: a URL, an address.
 * Translating them would break them.
 */
export const NON_PROSE_TEXT_KEYS: ReadonlySet<string> = new Set(['agoraOrigin', 'privacyContact']);

const URL_OR_EMAIL = /^(https?:\/\/\S+|[^\s@]+@[^\s@]+\.[^\s@]+)$/i;

/** True for a string worth sending to a translator. */
export function isProse(text: string | undefined | null): text is string {
	if (typeof text !== 'string') return false;
	const trimmed = text.trim();

	return trimmed !== '' && !URL_OR_EMAIL.test(trimmed);
}

/** Short, stable fingerprint of a Hebrew source string. */
export function hashSource(text: string): string {
	return createHash('sha1').update(text.trim()).digest('hex').slice(0, 12);
}

export function joinPath(...segments: (string | number)[]): string {
	return segments.join('/');
}

function item(path: string, text: string | undefined | null): TranslationItem[] {
	return isProse(text) ? [{ path, text }] : [];
}

function record(prefix: string, entries: Record<string, string> | undefined): TranslationItem[] {
	return Object.entries(entries ?? {}).flatMap(([key, text]) => item(joinPath(prefix, key), text));
}

function gameChunk(game: OdysseyGame): TranslationChunk {
	const items: TranslationItem[] = [];
	for (const [key, text] of Object.entries(game.texts)) {
		if (!NON_PROSE_TEXT_KEYS.has(key)) items.push(...item(joinPath('texts', key), text));
	}
	for (const question of game.compassQuestions) {
		const prefix = joinPath('compassQuestions', question.questionId);
		items.push(...item(joinPath(prefix, 'title'), question.title));
		items.push(...item(joinPath(prefix, 'prompt'), question.prompt));
		question.chips.forEach((chip, index) => {
			items.push(...item(joinPath(prefix, 'chips', index), chip));
		});
	}
	for (const value of game.values) {
		items.push(...item(joinPath('values', value.valueId), value.label));
	}

	return { chunkId: 'game', items };
}

function partiesChunk(game: OdysseyGame): TranslationChunk {
	const items = game.parties.flatMap((party) => {
		const prefix = joinPath('parties', party.partyId);

		return [
			...item(joinPath(prefix, 'name'), party.name),
			...item(joinPath(prefix, 'description'), party.description),
		];
	});

	return { chunkId: 'parties', items };
}

function islandChunks(game: OdysseyGame, statements: Statement[]): TranslationChunk[] {
	const byId = new Map(statements.map((statement) => [statement.statementId, statement]));

	return game.islands.map((island) => {
		const prefix = joinPath('islands', island.statementId);
		const question = byId.get(island.statementId);
		const stances = statements.filter(
			(statement) =>
				statement.parentId === island.statementId &&
				statement.statementType === StatementType.option &&
				!statement.hide,
		);
		const items: TranslationItem[] = [
			...item(joinPath(prefix, 'title'), island.title),
			...item(joinPath(prefix, 'issue'), island.issue),
			...item(joinPath(prefix, 'shortExplain'), island.shortExplain),
			...item(joinPath(prefix, 'opening'), island.opening),
			...item(joinPath(prefix, 'depthQuestion'), island.depthQuestion),
			...item(joinPath(prefix, 'question'), question?.statement),
			...stances.flatMap((stance) =>
				item(joinPath('stances', stance.statementId), stance.statement),
			),
		];

		return { chunkId: `island:${island.statementId}`, items };
	});
}

function elderChunk(elder: OdysseyElder): TranslationChunk {
	const prefix = joinPath('elders', elder.elderId);
	const items: TranslationItem[] = [
		...item(joinPath(prefix, 'name'), elder.name),
		...item(joinPath(prefix, 'role'), elder.role),
		...item(joinPath(prefix, 'bio'), elder.bio),
		...elder.needs.flatMap((need, index) => item(joinPath(prefix, 'needs', index), need)),
		...elder.values.flatMap((value) => [
			...item(joinPath(prefix, 'values', value.valueId, 'label'), value.label),
			...item(joinPath(prefix, 'values', value.valueId, 'description'), value.description),
		]),
		...record(joinPath(prefix, 'reactions'), elder.reactions),
		...record(joinPath(prefix, 'challenges'), elder.challenges),
		...Object.entries(elder.counsel ?? {}).flatMap(([islandId, byStance]) =>
			record(joinPath(prefix, 'counsel', islandId), byStance),
		),
	];

	return {
		chunkId: `elder:${elder.elderId}`,
		voice: { name: elder.name, role: elder.role, bio: elder.bio },
		items,
	};
}

/**
 * The whole game as translation chunks: one for compass + values + texts,
 * one for the parties, one per island (with its stances, so the shores are
 * translated in the light of their question), one per elder (so the voice
 * holds across every line that elder speaks).
 */
export function buildTranslationChunks(
	game: OdysseyGame,
	statements: Statement[],
): TranslationChunk[] {
	return [
		gameChunk(game),
		partiesChunk(game),
		...islandChunks(game, statements),
		...(game.elders ?? []).map(elderChunk),
	].filter((chunk) => chunk.items.length > 0);
}
