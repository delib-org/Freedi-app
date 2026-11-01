import type {
	OdysseyCompassQuestion,
	OdysseyElder,
	OdysseyElderTranslation,
	OdysseyGameTranslation,
	OdysseyIslandTranslation,
	OdysseyParty,
	OdysseyValue,
	Statement,
} from '@freedi/shared-types';
import type { GameContent, IslandContent } from './game';

/**
 * The displayed copy of a game.
 *
 * Hebrew is the canonical content: what is stored on a journey, matched
 * against an elder, or carried into Agora. A translation doc is an overlay on
 * top of it, and this is the only place the two meet. Every function here is
 * pure and falls back to the Hebrew FIELD BY FIELD, so a translation that is
 * missing, partial or stale still yields a readable game — never a blank.
 *
 * Ids are never touched: a localized island has the same statementId, a
 * localized chip sits at the same index. That is what lets `canonicalChip`
 * walk back from a displayed chip to the Hebrew one that gets stored.
 */

function pick(translated: string | undefined, canonical: string): string {
	return translated && translated.trim() !== '' ? translated : canonical;
}

/** Index-aligned list overlay: a missing or blank entry keeps the canonical one. */
function pickList(
	translated: readonly string[] | undefined,
	canonical: readonly string[],
): string[] {
	return canonical.map((item, index) => pick(translated?.[index], item));
}

export function localizeTexts(
	texts: Record<string, string>,
	translation: Record<string, string> | undefined,
): Record<string, string> {
	if (!translation) return texts;
	const localized = { ...texts };
	for (const [key, value] of Object.entries(translation)) {
		if (key in texts) localized[key] = pick(value, texts[key]);
	}

	return localized;
}

function localizeCompassQuestion(
	question: OdysseyCompassQuestion,
	translation: OdysseyGameTranslation['compassQuestions'],
): OdysseyCompassQuestion {
	const entry = translation?.[question.questionId];
	if (!entry) return question;

	return {
		...question,
		title: pick(entry.title, question.title),
		prompt: pick(entry.prompt, question.prompt),
		chips: pickList(entry.chips, question.chips),
	};
}

function localizeValue(
	value: OdysseyValue,
	translation: OdysseyGameTranslation['values'],
): OdysseyValue {
	return { ...value, label: pick(translation?.[value.valueId], value.label) };
}

function localizeParty(
	party: OdysseyParty,
	translation: OdysseyGameTranslation['parties'],
): OdysseyParty {
	const entry = translation?.[party.partyId];
	if (!entry) return party;

	return {
		...party,
		name: pick(entry.name, party.name),
		description: pick(entry.description, party.description),
	};
}

function localizeRecord(
	canonical: Record<string, string>,
	translation: Record<string, string> | undefined,
): Record<string, string> {
	if (!translation) return canonical;

	return Object.fromEntries(
		Object.entries(canonical).map(([key, value]) => [key, pick(translation[key], value)]),
	);
}

function localizeCounsel(
	canonical: OdysseyElder['counsel'],
	translation: OdysseyElderTranslation['counsel'],
): OdysseyElder['counsel'] {
	if (!canonical || !translation) return canonical;

	return Object.fromEntries(
		Object.entries(canonical).map(([islandId, byStance]) => [
			islandId,
			localizeRecord(byStance, translation[islandId]),
		]),
	);
}

export function localizeElder(
	elder: OdysseyElder,
	translation: OdysseyElderTranslation | undefined,
): OdysseyElder {
	if (!translation) return elder;

	return {
		...elder,
		name: pick(translation.name, elder.name),
		role: pick(translation.role, elder.role),
		bio: pick(translation.bio, elder.bio),
		needs: pickList(translation.needs, elder.needs),
		values: elder.values.map((value) => {
			const entry = translation.values?.[value.valueId];

			return entry
				? {
						...value,
						label: pick(entry.label, value.label),
						description: pick(entry.description, value.description),
					}
				: value;
		}),
		reactions: localizeRecord(elder.reactions, translation.reactions),
		challenges: localizeRecord(elder.challenges, translation.challenges),
		counsel: localizeCounsel(elder.counsel, translation.counsel),
	};
}

function localizeStatementText(statement: Statement, translated: string | undefined): Statement {
	return translated && translated.trim() !== ''
		? { ...statement, statement: translated }
		: statement;
}

function localizeIsland(
	island: IslandContent,
	entry: OdysseyIslandTranslation | undefined,
	stances: OdysseyGameTranslation['stances'],
): IslandContent {
	const localizedStances = stances
		? island.stances.map((stance) => localizeStatementText(stance, stances[stance.statementId]))
		: island.stances;
	if (!entry) return { ...island, stances: localizedStances };

	return {
		...island,
		title: pick(entry.title, island.title),
		issue: pick(entry.issue, island.issue),
		shortExplain: pick(entry.shortExplain, island.shortExplain),
		opening: pick(entry.opening, island.opening),
		depthQuestion: pick(entry.depthQuestion, island.depthQuestion),
		statement: localizeStatementText(island.statement, entry.question),
		stances: localizedStances,
	};
}

/**
 * A localized copy of `content`. With no translation (Hebrew, or a language
 * nobody translated yet) the SAME object comes back, so callers can test
 * identity to learn whether anything changed.
 */
export function localizeGame(
	content: GameContent,
	translation: OdysseyGameTranslation | null,
): GameContent {
	if (!translation) return content;
	const { game } = content;

	return {
		game: {
			...game,
			texts: localizeTexts(game.texts, translation.texts),
			compassQuestions: game.compassQuestions.map((question) =>
				localizeCompassQuestion(question, translation.compassQuestions),
			),
			values: game.values.map((value) => localizeValue(value, translation.values)),
			parties: game.parties.map((party) => localizeParty(party, translation.parties)),
			elders: game.elders?.map((elder) =>
				localizeElder(elder, translation.elders?.[elder.elderId]),
			),
		},
		islands: content.islands.map((island) =>
			localizeIsland(island, translation.islands?.[island.statementId], translation.stances),
		),
	};
}

/**
 * The chip at the same index in the other copy of a question — how a
 * displayed (translated) chip becomes the stored (Hebrew) one and back.
 * A chip that is not in `from` (a free-text answer, an old chip since
 * removed) is returned as it is.
 */
export function siblingChip(
	from: GameContent | null,
	to: GameContent | null,
	questionId: string,
	chip: string,
): string {
	if (!from || !to || from === to) return chip;
	const source = from.game.compassQuestions.find((q) => q.questionId === questionId);
	const target = to.game.compassQuestions.find((q) => q.questionId === questionId);
	if (!source || !target) return chip;
	const index = source.chips.indexOf(chip);
	if (index === -1) return chip;

	return target.chips[index] ?? chip;
}
