import {
	object,
	string,
	number,
	optional,
	nullable,
	array,
	record,
	InferOutput,
} from 'valibot';

/**
 * A player's personal voyage state for one Odyssey game.
 *
 * Deliberative answers (attitudes toward stances) are NOT stored here — they
 * are standard Freedi evaluations on the stance Statements. The journey only
 * holds the reflective, personal layer: the compass, chosen islands, depth
 * answers and the captain's log.
 */

export const OdysseyCompassAnswerSchema = object({
	answer: string(),
	chips: array(string()),
});

export type OdysseyCompassAnswer = InferOutput<
	typeof OdysseyCompassAnswerSchema
>;

export const OdysseyLogEntrySchema = object({
	/** island statementId this entry was written on (null = general) */
	islandStatementId: optional(nullable(string())),
	text: string(),
	createdAt: number(),
});

export type OdysseyLogEntry = InferOutput<typeof OdysseyLogEntrySchema>;

export const OdysseyJourneySchema = object({
	/** `${uid}--${gameId}` */
	journeyId: string(),
	gameId: string(),
	userId: string(),
	/** Display name snapshot, for showing fellow sailors */
	displayName: optional(nullable(string())),
	/** compass questionId → answer */
	compassAnswers: record(string(), OdysseyCompassAnswerSchema),
	/** valueId → rank (1 = most important) */
	valueRankings: record(string(), number()),
	/** island statementIds the player chose on the map */
	selectedIslandIds: array(string()),
	/** island statementId → free-text depth answer */
	depthAnswers: record(string(), string()),
	logEntries: array(OdysseyLogEntrySchema),
	createdAt: number(),
	lastUpdate: number(),
});

export type OdysseyJourney = InferOutput<typeof OdysseyJourneySchema>;

/** Journey doc id — one journey per user per game, idempotent upsert. */
export function createOdysseyJourneyId(uid: string, gameId: string): string {
	return `${uid}--${gameId}`;
}
