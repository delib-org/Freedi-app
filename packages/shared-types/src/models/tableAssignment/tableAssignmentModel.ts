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
});
export type TableAssignmentParticipant = InferOutput<typeof TableAssignmentParticipantSchema>;

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
	stats: TableAssignmentTableStatsSchema,
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

/** Same shape as the engine's AssignmentMetrics (packages/table-assignment). */
export const TableAssignmentMetricsSchema = object({
	population: PopulationStatsSchema,
	balance: BalanceMetricsSchema,
	preferences: PreferenceMetricsSchema,
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
