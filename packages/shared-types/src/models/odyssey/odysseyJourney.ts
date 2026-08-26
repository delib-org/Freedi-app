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
	/**
	 * elderIds the player invited to sail with them.
	 *
	 * Absent means the player has not been asked yet — journeys begun before
	 * the choosing screen existed, for whom every enabled elder sails, which is
	 * how it worked then. An EMPTY array is a different thing and must not be
	 * confused with it: that is a player who was asked and said no one.
	 */
	selectedElderIds: optional(array(string())),
	/** island statementId → free-text depth answer */
	depthAnswers: record(string(), string()),
	logEntries: array(OdysseyLogEntrySchema),
	/**
	 * island statementId → millis of the last time the player sailed through
	 * that island's gate into its Agora deliberation. Only ever used to mark
	 * the gate as already visited, so the map can invite them onward to the
	 * islands they have not deliberated yet.
	 */
	deliberationVisits: optional(record(string(), number())),
	createdAt: number(),
	lastUpdate: number(),
});

export type OdysseyJourney = InferOutput<typeof OdysseyJourneySchema>;

/** Journey doc id — one journey per user per game, idempotent upsert. */
export function createOdysseyJourneyId(uid: string, gameId: string): string {
	return `${uid}--${gameId}`;
}
