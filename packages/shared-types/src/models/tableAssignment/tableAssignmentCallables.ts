import type {
	TableAssignment,
	TableAssignmentMode,
	TableAssignmentParticipant,
	TableAssignmentPositionQuestion,
	TableAssignmentSettings,
	TableAssignmentStatus,
} from './tableAssignmentModel';

/**
 * Wire contracts of the Tables callables (region me-west1, App Check).
 * Clients (apps/tables, packages/table-assignment-client) and functions
 * both import these; drift is a compile error.
 * Actor rules: host (the session's hostUid) unless stated otherwise.
 * Participants are Firebase anonymous-auth or signed-in users.
 */

/** `tablesCreateSession` (host, signed in with Google). */
export interface TablesCreateSessionRequest {
	title: string;
	mode: TableAssignmentMode;
	contextStatementId?: string;
	settings?: Partial<TableAssignmentSettings>;
}
export interface TablesCreateSessionResponse {
	session: TableAssignment;
}

/** One topic in a `tablesSaveTopics` call. Omit `topicId` to add a new topic. */
export interface TablesTopicInput {
	topicId?: string;
	title: string;
	description?: string;
	sourceStatementId?: string;
	consensus?: number;
	maxTables?: number;
}

/** `tablesSaveTopics` (host). Replaces the topic list; array order is the display order. */
export interface TablesSaveTopicsRequest {
	sessionId: string;
	topics: TablesTopicInput[];
}
export interface TablesSaveTopicsResponse {
	topicIds: string[];
}

/** `tablesSaveSettings` (host). Changing inputs makes any earlier preview stale. */
export interface TablesSaveSettingsRequest {
	sessionId: string;
	title?: string;
	tableSize?: number;
	balanceTolerance?: number;
	/** `null` removes the position question. */
	positionQuestion?: TableAssignmentPositionQuestion | null;
}
export interface TablesSaveSettingsResponse {
	settings: TableAssignmentSettings;
}

/** `tablesSetStatus` (host): open or close registration, or end. Publishing is `tablesPublishRun`. */
export interface TablesSetStatusRequest {
	sessionId: string;
	status: Extract<TableAssignmentStatus, 'registrationOpen' | 'registrationClosed' | 'ended'>;
}
export interface TablesSetStatusResponse {
	status: TableAssignmentStatus;
}

/** `tablesRegister` (participant). Idempotent: registering again updates the name. */
export interface TablesRegisterRequest {
	sessionId: string;
	fullName: string;
}
export interface TablesRegisterResponse {
	participant: TableAssignmentParticipant;
}

/** `tablesSavePreferences` (participant, before registration closes). */
export interface TablesSavePreferencesRequest {
	sessionId: string;
	/** Topic ids, best first, at most three. */
	preferences: string[];
	/** 0..100; omit to leave "not specified". */
	position?: number;
}
export interface TablesSavePreferencesResponse {
	participant: TableAssignmentParticipant;
}

/** `tablesJoinTable` (participant, direct mode). Atomic; fails with `failed-precondition` when the table is full. */
export interface TablesJoinTableRequest {
	sessionId: string;
	tableIndex: number;
}
export interface TablesJoinTableResponse {
	tableIndex: number;
	topicId: string;
}

/** `tablesComputePreview` (host). Returns the id of the computed (or computing) run. */
export interface TablesComputePreviewRequest {
	sessionId: string;
	/** Same seed gives the same seating; omit for a fresh one. */
	seed?: number;
}
export interface TablesComputePreviewResponse {
	runId: string;
}

/** `tablesPublishRun` (host). Idempotent; refused when the run's input is stale. */
export interface TablesPublishRunRequest {
	sessionId: string;
	runId: string;
}
export interface TablesPublishRunResponse {
	publishedRunId: string;
}
