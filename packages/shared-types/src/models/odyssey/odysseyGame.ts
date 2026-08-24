import {
	object,
	string,
	number,
	boolean,
	optional,
	nullable,
	array,
	record,
	InferOutput,
} from 'valibot';
import { OdysseyGameScriptSchema } from './odysseyGameScript';
import { OdysseyElderSchema } from './odysseyElder';

/**
 * Israeli Odyssey (אודיסיאה ישראלית) — a pre-election civic-voice game and a
 * preface to the Agora deliberation.
 *
 * The deliberative content is NOT stored here: islands are Statement docs of
 * type `question`, and their stances (חופים) are Statement docs of type
 * `option`, all in Collections.statements. Users answer stances through the
 * standard evaluations collection, so the shared consensus pipeline runs on
 * them like on any other Freedi option.
 *
 * This model holds only the game-specific presentation/config layer:
 * screen texts, island map metadata, party routes, and the personal compass
 * definition (which is reflective, not deliberative).
 */

/** The three attitudes a player can mark on a stance, and their value on the
 *  standard agree-disagree evaluation scale (-1..1). */
export const ODYSSEY_ATTITUDES = [
	{ key: 'support', label: 'תומך/ת', value: 1 },
	{ key: 'livewith', label: 'יכול/ה לחיות עם זה', value: 0.5 },
	{ key: 'oppose', label: 'מתנגד/ת', value: -1 },
] as const;

export type OdysseyAttitudeKey = (typeof ODYSSEY_ATTITUDES)[number]['key'];

/** Single fixed game document id — the app currently runs one game. */
export const ODYSSEY_DEFAULT_GAME_ID = 'default';

/** Extra field written on evaluation docs to scope them to an Odyssey game
 *  (mirrors Agora's agoraSessionId pattern). */
export const ODYSSEY_GAME_FIELD = 'odysseyGameId';

export const OdysseyCompassQuestionSchema = object({
	questionId: string(),
	/** e.g. רוח האהבה */
	title: string(),
	prompt: string(),
	/** Inspiration chips the player can toggle */
	chips: array(string()),
	sortOrder: number(),
	enabled: boolean(),
});

export type OdysseyCompassQuestion = InferOutput<
	typeof OdysseyCompassQuestionSchema
>;

export const OdysseyValueSchema = object({
	valueId: string(),
	label: string(),
	sortOrder: number(),
	enabled: boolean(),
});

export type OdysseyValue = InferOutput<typeof OdysseyValueSchema>;

/** Map/pedagogic metadata for an island. The island's central question text
 *  and its stances live on Statement docs; `statementId` links them. */
export const OdysseyIslandSchema = object({
	/** statementId of the island's `question` Statement */
	statementId: string(),
	/** Short island name shown on the map (e.g. שלטון החוק) */
	title: string(),
	/** The civic issue subtitle */
	issue: string(),
	/** Short plain-language explanation */
	shortExplain: string(),
	/** Narrative opening (the island character) */
	opening: string(),
	/** Optional depth question (free text, stored on the journey) */
	depthQuestion: string(),
	imageUrl: optional(nullable(string())),
	/** Position on the map, percent of width/height */
	posX: number(),
	posY: number(),
	sortOrder: number(),
	enabled: boolean(),
	/**
	 * The two stances that act as poles when a player carries their island
	 * position into the Agora deliberation. Supporting one and rejecting the
	 * other puts them in a wing camp; anything mixed — or these left unset —
	 * leaves them in the centre. Pick genuinely opposed stances: camps that all
	 * collapse to centre make the bridging score inert.
	 */
	leftAnchorStanceId: optional(nullable(string())),
	rightAnchorStanceId: optional(nullable(string())),
});

export type OdysseyIsland = InferOutput<typeof OdysseyIslandSchema>;

/** The civic Agora deliberation opened for one island. */
export const OdysseyIslandAgoraSessionSchema = object({
	sessionId: string(),
	/** Join code — the gate link is `${agoraOrigin}/#!/join/${code}` */
	code: string(),
	topicPackageId: string(),
	createdAt: number(),
});

export type OdysseyIslandAgoraSession = InferOutput<
	typeof OdysseyIslandAgoraSessionSchema
>;

export const OdysseyPartySchema = object({
	partyId: string(),
	name: string(),
	color: string(),
	imageUrl: optional(nullable(string())),
	description: string(),
	/** island statementId → stance statementId the party is closest to */
	positions: record(string(), string()),
	sortOrder: number(),
	enabled: boolean(),
});

export type OdysseyParty = InferOutput<typeof OdysseyPartySchema>;

export const OdysseyGameSchema = object({
	gameId: string(),
	/** Root `question` Statement of the whole game tree */
	rootStatementId: string(),
	/** Editable screen texts, keyed by well-known keys (gameTitle, introMotto, …) */
	texts: record(string(), string()),
	compassQuestions: array(OdysseyCompassQuestionSchema),
	values: array(OdysseyValueSchema),
	islands: array(OdysseyIslandSchema),
	parties: array(OdysseyPartySchema),
	/**
	 * Historical elder personas who play alongside the user. Runtime behavior
	 * is additionally gated on `script.eldersEnabled`.
	 */
	elders: optional(array(OdysseyElderSchema)),
	/**
	 * island statementId → the civic Agora session opened for it. Kept on the
	 * game doc so the summary and the map can show every gate's state in the
	 * read they already do, without querying agoraSessions.
	 */
	agoraSessions: optional(record(string(), OdysseyIslandAgoraSessionSchema)),
	/**
	 * Which beats this event's Agora deliberations run. Absent means the
	 * legacy civic shape. Projected onto each session when it is provisioned —
	 * Agora reads the session, never this document.
	 */
	script: optional(OdysseyGameScriptSchema),
	/** Uids allowed to edit the game (besides the creator) */
	adminUids: array(string()),
	creatorId: string(),
	createdAt: number(),
	lastUpdate: number(),
});

export type OdysseyGame = InferOutput<typeof OdysseyGameSchema>;
