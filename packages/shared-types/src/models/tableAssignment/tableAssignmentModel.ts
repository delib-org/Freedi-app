import {
	array,
	boolean,
	InferOutput,
	integer,
	maxLength,
	maxValue,
	minLength,
	minValue,
	number,
	object,
	optional,
	picklist,
	pipe,
	string,
} from 'valibot';
import { SideValueSchema } from '../classroom/classroomModel';
import { TableAssignmentClosenessSchema } from './tableAssignmentCloseness';

/**
 * Tables (שולחנות): shared table-assignment product. Data model.
 *
 * Contract shared by apps/tables (and any app that opens it) and the
 * Cloud Functions that own writes. Field names are the wire format.
 * All timestamps are milliseconds. Concept names: TableAssignment*, never
 * "allocation" or "rooms".
 *
 * Doc ids: session = `tableAssignmentId`; participant = `${sessionId}_${uid}`.
 */

/** Seats per table when the host sets nothing. */
export const TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT = 7;
/** Worst allowed table deviation from the crowd, in population-sd units. */
export const TABLE_ASSIGNMENT_BALANCE_TOLERANCE_DEFAULT = 0.3;
/** Ranked preferences a participant may save. */
export const TABLE_ASSIGNMENT_MAX_PREFERENCES = 3;
/** Smallest table a host can choose. */
export const TABLE_ASSIGNMENT_TABLE_SIZE_MIN = 2;
/** Largest table a host can choose. */
export const TABLE_ASSIGNMENT_TABLE_SIZE_MAX = 20;
/** Longest title, topic label, or position label. */
export const TABLE_ASSIGNMENT_TITLE_MAX_LENGTH = 200;
/** Longest topic description. */
export const TABLE_ASSIGNMENT_DESCRIPTION_MAX_LENGTH = 2000;
/** Longest participant full name. */
export const TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH = 100;
/** The balance tolerance behind each strictness choice. Any other stored number is a custom value. */
export const TABLE_ASSIGNMENT_STRICTNESS = { strict: 0.15, balanced: 0.3, flexible: 0.45 } as const;
/** The five stops a participant answers the position question on. */
export const TABLE_ASSIGNMENT_POSITION_STOPS = [0, 25, 50, 75, 100] as const;

/** Lifecycle of one TableAssignment: draft, registration open/closed, published, ended. */
export const TableAssignmentStatusSchema = picklist([
	'draft',
	'registrationOpen',
	'registrationClosed',
	'published',
	'ended',
]);
export type TableAssignmentStatus = InferOutput<typeof TableAssignmentStatusSchema>;

/** `direct`: participants pick a table. `ranked`: they rank topics and the engine seats them. */
export const TableAssignmentModeSchema = picklist(['direct', 'ranked']);
export type TableAssignmentMode = InferOutput<typeof TableAssignmentModeSchema>;

const TitleSchema = pipe(string(), minLength(1), maxLength(TABLE_ASSIGNMENT_TITLE_MAX_LENGTH));
const MillisSchema = pipe(number(), integer(), minValue(0));
const NonNegativeIntSchema = pipe(number(), integer(), minValue(0));

/** The optional position question (עמדה): one axis 0..100 with two poles. */
export const TableAssignmentPositionQuestionSchema = object({
	label: TitleSchema,
	poleA: TitleSchema,
	poleB: TitleSchema,
});
export type TableAssignmentPositionQuestion = InferOutput<
	typeof TableAssignmentPositionQuestionSchema
>;

export const TableAssignmentSettingsSchema = object({
	tableSize: optional(
		pipe(
			number(),
			integer(),
			minValue(TABLE_ASSIGNMENT_TABLE_SIZE_MIN),
			maxValue(TABLE_ASSIGNMENT_TABLE_SIZE_MAX),
		),
		TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT,
	),
	balanceTolerance: optional(
		pipe(number(), minValue(0)),
		TABLE_ASSIGNMENT_BALANCE_TOLERANCE_DEFAULT,
	),
	positionQuestion: optional(TableAssignmentPositionQuestionSchema),
	/** How many people the host expects; only feeds the setup summary, never the seating. */
	expectedParticipants: optional(pipe(number(), integer(), minValue(1))),
	/** Lets a person take over a registration by typing the same full name. Absent means off. */
	allowReturnByName: optional(boolean()),
});
export type TableAssignmentSettings = InferOutput<typeof TableAssignmentSettingsSchema>;

/** One session. Collection `tableAssignments`, doc id `tableAssignmentId`. */
export const TableAssignmentSchema = object({
	tableAssignmentId: string(),
	hostUid: string(),
	contextStatementId: optional(string()),
	title: TitleSchema,
	mode: TableAssignmentModeSchema,
	status: TableAssignmentStatusSchema,
	settings: TableAssignmentSettingsSchema,
	publishedRunId: optional(string()),
	createdAt: MillisSchema,
	lastUpdate: MillisSchema,
});
export type TableAssignment = InferOutput<typeof TableAssignmentSchema>;

/** A topic (נושא). Collection `tableAssignmentTopics`. */
export const TableAssignmentTopicSchema = object({
	topicId: string(),
	sessionId: string(),
	title: TitleSchema,
	description: optional(pipe(string(), maxLength(TABLE_ASSIGNMENT_DESCRIPTION_MAX_LENGTH))),
	/** Imported topics point at the original proposal Statement. */
	sourceStatementId: optional(string()),
	/** C_p: the proposal's consensus at registration time (describes the proposal, not a person). */
	consensus: optional(number()),
	/** Hard cap on tables opened for this topic. */
	maxTables: optional(pipe(number(), integer(), minValue(1))),
	order: NonNegativeIntSchema,
});
export type TableAssignmentTopic = InferOutput<typeof TableAssignmentTopicSchema>;

/** Topic ids, best first, at most three. */
export const TableAssignmentPreferencesSchema = pipe(
	array(string()),
	maxLength(TABLE_ASSIGNMENT_MAX_PREFERENCES),
);

/**
 * A registrant (נרשם/ת). Collection `tableAssignmentParticipants`,
 * doc id `${sessionId}_${uid}` (see tableAssignmentParticipantId).
 * `position` missing means "not specified" (לא צוין), never the middle.
 * Private to its owner: the host reads names from the roster, never this.
 */
export const TableAssignmentParticipantSchema = object({
	sessionId: string(),
	uid: string(),
	fullName: pipe(string(), minLength(1), maxLength(TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH)),
	preferences: TableAssignmentPreferencesSchema,
	position: optional(SideValueSchema),
	/** Direct mode: the table the participant joined. */
	chosenTableIndex: optional(NonNegativeIntSchema),
	registeredAt: MillisSchema,
	/** This registration took over another one by full name, so it cannot be cancelled. */
	claimedByName: optional(boolean()),
});
export type TableAssignmentParticipant = InferOutput<typeof TableAssignmentParticipantSchema>;

/**
 * A registrant's name card. Collection `tableAssignmentRoster`, same doc id as
 * the private record. What the host sees: a name and progress, never an answer.
 */
export const TableAssignmentRosterEntrySchema = object({
	sessionId: string(),
	uid: string(),
	fullName: pipe(string(), minLength(1), maxLength(TABLE_ASSIGNMENT_FULL_NAME_MAX_LENGTH)),
	/** See tableAssignmentNameKey. */
	nameKey: string(),
	registeredAt: MillisSchema,
	hasPreferences: boolean(),
	/** Direct mode: the table the participant joined. */
	chosenTableIndex: optional(NonNegativeIntSchema),
});
export type TableAssignmentRosterEntry = InferOutput<typeof TableAssignmentRosterEntrySchema>;

/** How many registered. Collection `tableAssignmentCounters`, doc id = session id. */
export const TableAssignmentCounterSchema = object({
	sessionId: string(),
	registered: NonNegativeIntSchema,
});
export type TableAssignmentCounter = InferOutput<typeof TableAssignmentCounterSchema>;

/** Two spellings of one full name compare equal: spacing, case and Unicode form are ignored. */
export function tableAssignmentNameKey(fullName: string): string {
	return fullName.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function tableAssignmentParticipantId(sessionId: string, uid: string): string {
	return `${sessionId}_${uid}`;
}

export const TableAssignmentRunStatusSchema = picklist([
	'computing',
	'ready',
	'published',
	'superseded',
]);
export type TableAssignmentRunStatus = InferOutput<typeof TableAssignmentRunStatusSchema>;

/** Same shape as the engine's TableStats (packages/table-assignment). */
export const TableAssignmentTableStatsSchema = object({
	n: NonNegativeIntSchema,
	mean: array(number()),
	sd: array(number()),
	deviation: number(),
});
export type TableAssignmentTableStats = InferOutput<typeof TableAssignmentTableStatsSchema>;

export const TableAssignmentRunTableSchema = object({
	index: NonNegativeIntSchema,
	topicId: string(),
	memberUids: array(string()),
	/** Always empty on runs computed now; older documents may still hold figures. */
	stats: TableAssignmentTableStatsSchema,
	/** How close this table is to the room. Host previews only; absent on published and older runs. */
	closeness: optional(TableAssignmentClosenessSchema),
});
export type TableAssignmentRunTable = InferOutput<typeof TableAssignmentRunTableSchema>;

const PopulationStatsSchema = object({
	n: NonNegativeIntSchema,
	mean: array(number()),
	sd: array(number()),
});

const BalanceMetricsSchema = object({
	max: number(),
	mean: number(),
	tolerance: number(),
	withinTolerance: boolean(),
});

const PreferenceMetricsSchema = object({
	/** byRank[0] = participants seated at their first choice, and so on. */
	byRank: array(number()),
	none: number(),
	noPreference: number(),
	score: number(),
	maxScore: number(),
});

/**
 * What a run stores about the room. `population` and `balance.max/mean` are
 * written empty (0 and []) so no figure about positions is ever stored; older
 * documents may still hold figures. `preferences` is empty on a published run.
 */
export const TableAssignmentMetricsSchema = object({
	population: PopulationStatsSchema,
	balance: BalanceMetricsSchema,
	preferences: PreferenceMetricsSchema,
	/** At least three people gave a position. Absent on older runs. */
	hasEnoughPositions: optional(boolean()),
});
export type TableAssignmentMetrics = InferOutput<typeof TableAssignmentMetricsSchema>;

/** One computed seating. Collection `tableAssignmentRuns`. */
export const TableAssignmentRunSchema = object({
	runId: string(),
	sessionId: string(),
	seed: number(),
	status: TableAssignmentRunStatusSchema,
	tables: array(TableAssignmentRunTableSchema),
	metrics: TableAssignmentMetricsSchema,
	/** Hash of the frozen input; a published run is only valid while it still matches. */
	inputHash: string(),
	createdAt: MillisSchema,
	publishedAt: optional(MillisSchema),
});
export type TableAssignmentRun = InferOutput<typeof TableAssignmentRunSchema>;
