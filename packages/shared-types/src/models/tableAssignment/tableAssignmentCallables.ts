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
	/** Accepted while the session is a draft only. */
	mode?: TableAssignmentMode;
	/** `null` removes the number. */
	expectedParticipants?: number | null;
	allowReturnByName?: boolean;
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

/**
 * What to do when return by full name is on and exactly one other registration
 * has this name. `ask`: report it and write nothing. `claim`: replace that
 * registration with an empty one for the caller. `separate`: a new registration.
 */
export type TablesNameMatch = 'ask' | 'claim' | 'separate';

/** `tablesRegister` (participant). Idempotent: registering again updates the name. */
export interface TablesRegisterRequest {
	sessionId: string;
	fullName: string;
	/** Defaults to `ask`. */
	nameMatch?: TablesNameMatch;
}
export interface TablesRegisterResponse {
	outcome: 'registered' | 'nameExists';
	/** The caller's own record; absent for `nameExists`. Never another person's data. */
	participant?: TableAssignmentParticipant;
}

/**
 * `tablesCancelRegistration` (the participant, own uid, while registration is open).
 * Refused with reason `claimed-by-name` for a registration taken over by full name.
 * No-op success when not registered.
 */
export interface TablesCancelRegistrationRequest {
	sessionId: string;
}
export interface TablesCancelRegistrationResponse {
	cancelled: true;
}

/**
 * `tablesRemoveParticipant` (host, any status but `ended`). A ready preview goes
 * stale. Refused with reason `seated-in-published-run` for someone seated in the
 * published assignment. No-op success when the person is not registered.
 */
export interface TablesRemoveParticipantRequest {
	sessionId: string;
	uid: string;
}
export interface TablesRemoveParticipantResponse {
	removed: true;
}

/** One topic's new title in a `tablesFixDetails` call. */
export interface TablesFixDetailsTopic {
	topicId: string;
	title: string;
}

/**
 * `tablesFixDetails` (host, after registration opens and until the session ends).
 * Titles only, so a ready preview stays publishable. `topics`, when sent, lists
 * every topic of the session, once each, in the current order.
 */
export interface TablesFixDetailsRequest {
	sessionId: string;
	title?: string;
	topics?: TablesFixDetailsTopic[];
}
export interface TablesFixDetailsResponse {
	title: string;
	topicIds: string[];
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
