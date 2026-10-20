import {
	object,
	string,
	number,
	optional,
	array,
	record,
	picklist,
	InferOutput,
} from 'valibot';
import { Collections } from '../collections/collectionsModel';

/**
 * One language's overlay on an Odyssey game.
 *
 * The game is authored once, in Hebrew, and every player — Hebrew, English or
 * Arabic reader — sails the SAME sea: same islands, same stances, same
 * opinion map. A translation doc never changes what is stored or matched;
 * it only changes what is displayed. It lives in a subcollection of the game
 * (`odysseyGames/{gameId}/translations/{lang}`) so a Hebrew player never
 * reads it and the game document keeps its shape.
 *
 * Every record is keyed by the canonical id it translates (statementId,
 * questionId, valueId, partyId, elderId) and every field is optional: the
 * client falls back to Hebrew per field, so a half-translated game is a
 * readable game, not a broken one.
 */

export const ODYSSEY_TRANSLATIONS_SUBCOLLECTION = 'translations';

export const ODYSSEY_TRANSLATION_LANGS = ['en', 'ar'] as const;

export const OdysseyTranslationLangSchema = picklist(ODYSSEY_TRANSLATION_LANGS);

export type OdysseyTranslationLang = InferOutput<typeof OdysseyTranslationLangSchema>;

/** Firestore collection path of a game's translation docs. */
export function odysseyTranslationsPath(gameId: string): string {
	return `${Collections.odysseyGames}/${gameId}/${ODYSSEY_TRANSLATIONS_SUBCOLLECTION}`;
}

export const OdysseyCompassQuestionTranslationSchema = object({
	title: optional(string()),
	prompt: optional(string()),
	/** Index-aligned with the canonical `chips`: chips[i] translates chips[i]. */
	chips: optional(array(string())),
});

export type OdysseyCompassQuestionTranslation = InferOutput<
	typeof OdysseyCompassQuestionTranslationSchema
>;

export const OdysseyIslandTranslationSchema = object({
	title: optional(string()),
	issue: optional(string()),
	shortExplain: optional(string()),
	opening: optional(string()),
	depthQuestion: optional(string()),
	/** The island's central question — the `statement` text of its Statement. */
	question: optional(string()),
});

export type OdysseyIslandTranslation = InferOutput<typeof OdysseyIslandTranslationSchema>;

export const OdysseyPartyTranslationSchema = object({
	name: optional(string()),
	description: optional(string()),
});

export type OdysseyPartyTranslation = InferOutput<typeof OdysseyPartyTranslationSchema>;

export const OdysseyElderValueTranslationSchema = object({
	label: optional(string()),
	description: optional(string()),
});

/**
 * Every human-readable string an elder carries. Ids, colours, portrait and
 * lifespan stay canonical; `positions` are ids and are not here.
 */
export const OdysseyElderTranslationSchema = object({
	name: optional(string()),
	role: optional(string()),
	bio: optional(string()),
	/** Index-aligned with the canonical `needs`. */
	needs: optional(array(string())),
	/** valueId → translated label/description */
	values: optional(record(string(), OdysseyElderValueTranslationSchema)),
	/** stance statementId → translated remark */
	reactions: optional(record(string(), string())),
	/** island statementId → translated challenge */
	challenges: optional(record(string(), string())),
	/** island statementId → stance statementId → translated counsel */
	counsel: optional(record(string(), record(string(), string()))),
});

export type OdysseyElderTranslation = InferOutput<typeof OdysseyElderTranslationSchema>;

export const OdysseyGameTranslationSchema = object({
	gameId: string(),
	lang: OdysseyTranslationLangSchema,
	/** Millis of the last write */
	updatedAt: number(),
	/** text key → translated screen text */
	texts: optional(record(string(), string())),
	/** questionId → translation */
	compassQuestions: optional(record(string(), OdysseyCompassQuestionTranslationSchema)),
	/** valueId → translated label */
	values: optional(record(string(), string())),
	/** island statementId → translation */
	islands: optional(record(string(), OdysseyIslandTranslationSchema)),
	/** stance statementId → translated stance text */
	stances: optional(record(string(), string())),
	/** partyId → translation */
	parties: optional(record(string(), OdysseyPartyTranslationSchema)),
	/** elderId → translation */
	elders: optional(record(string(), OdysseyElderTranslationSchema)),
	/**
	 * source field path → short hash of the Hebrew it was translated from.
	 * The translate function compares these to the current Hebrew and
	 * re-translates only what changed; the admin screen counts the stale ones.
	 */
	sourceHashes: optional(record(string(), string())),
});

export type OdysseyGameTranslation = InferOutput<typeof OdysseyGameTranslationSchema>;
