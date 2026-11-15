import type {
	TableAssignment,
	TableAssignmentMode,
	TableAssignmentParticipant,
	TableAssignmentPositionQuestion,
	TableAssignmentEvent,
	TableAssignmentSettings,
	TableAssignmentStatus,
	TableAssignmentTopicCount,
} from './tableAssignmentModel';

/**
 * Wire contracts of the Tables callables (region me-west1; App Check is not enforced yet).
 * Clients (apps/tables, packages/table-assignment-client) and functions
 * both import these; drift is a compile error.
 * Actor rules: host (the session's hostUid) unless stated otherwise.
 * Participants are Firebase anonymous-auth or signed-in users.
 */

/**
 * `tablesCreateSession` (host, signed in with Google). Every new session gets
 * `splitByTopic: true`. With `settings.topicCount: 'one'` the server makes the
 * single topic (titled after the session) and the mode is `ranked` whatever
 * was asked.
 */
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
	/** When and where the gathering is. `null` removes it; empty parts are dropped by the server. */
	event?: TableAssignmentEvent | null;
	/**
	 * Draft only. 'one' replaces the topics with one topic named after the
	 * session and makes the mode `ranked`; 'several' keeps the topics as they
	 * are for the host to edit. While 'one', a title change renames that topic.
	 */
	topicCount?: TableAssignmentTopicCount;
}
export interface TablesSaveSettingsResponse {
	settings: TableAssignmentSettings;
}

/**
 * `tablesSetStatus` (host): open or close registration, or end. Publishing a
 * ranked session is `tablesPublishRun`. Closing a direct session with
 * `splitByTopic` ("sit where you like") is one press: the server splits each
 * topic into tables (IA tables-class-bridge 2.1), publishes them, and the
 * answer's status is `published`. Class's `classCloseRegistration` calls the same path.
 */
export interface TablesSetStatusRequest {
	sessionId: string;
	status: Extract<TableAssignmentStatus, 'registrationOpen' | 'registrationClosed' | 'ended'>;
}
export interface TablesSetStatusResponse {
	status: TableAssignmentStatus;
	/** Closing a splitByTopic session: the run it published. */
	publishedRunId?: string;
	/**
	 * Closing a splitByTopic session: topics one person chose, now a table of
	 * one. Nobody is moved; the host decides (the flag "בנושא {{topic}} נרשם אדם אחד").
	 */
	topicsWithOnePerson?: string[];
	/**
	 * Only when moving to `ended`: whether the answers are gone. `false` means the
	 * session did end but the erase failed; calling `ended` again retries it.
	 */
	answersErased?: boolean;
}

/**
 * What to do when return by full name is on and exactly one other registration
 * has this name. `ask`: report it and write nothing. `claim`: replace that
 * registration with an empty one for the caller. `separate`: a new registration.
 */
export type TablesNameMatch = 'ask' | 'claim' | 'separate';

/**
 * `tablesRegister` (participant). Idempotent: registering again updates the name.
 * Refused with reason `registration-full` for a new registration past the cap,
 * `name-locked` for a rename once published, `claimed-by-name` for a rename of
 * a registration taken over by full name.
 */
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
 * One atomic save of what can be corrected without touching anyone's answers.
 * `topics`, when sent, lists every topic of the session, once each, in the current order.
 * Any stage: `title`, `topics` (titles only), `event` (`null` removes it).
 * While registration is open only: `tableSize` (a direct session's is fixed once it
 * opens), `expectedParticipants` (`null` removes it), `allowReturnByName`, and
 * `positionQuestionLabel` (the wording of an existing question; its two ends and the
 * answers stay as they are, so a question cannot be added, removed or reversed here).
 * Omitted means keep. A value equal to the stored one is not a change.
 */
export interface TablesFixDetailsRequest {
	sessionId: string;
	title?: string;
	topics?: TablesFixDetailsTopic[];
	event?: TableAssignmentEvent | null;
	tableSize?: number;
	expectedParticipants?: number | null;
	allowReturnByName?: boolean;
	positionQuestionLabel?: string;
}
export interface TablesFixDetailsResponse {
	title: string;
	topicIds: string[];
}

/**
 * `tablesSavePreferences` (participant, before registration closes; after
 * publishing only a latecomer the tables do not seat). In a splitByTopic
 * session the list is the chosen topic, one id at most, and the topic's
 * `chosenCount` follows. A latecomer there is seated at once at the emptiest
 * table of their topic that has a free seat; with none they wait for the host.
 */
export interface TablesSavePreferencesRequest {
	sessionId: string;
	/** Topic ids, best first, at most three (one in a splitByTopic session). */
	preferences: string[];
	/** One of TABLE_ASSIGNMENT_POSITION_STOPS; omit to leave "not specified". */
	position?: number;
}
export interface TablesSavePreferencesResponse {
	participant: TableAssignmentParticipant;
	/** A latecomer this call seated: their table's index in the published run. */
	tableIndex?: number;
}

/**
 * `tablesSeatLink` (the participant themself). The code of their personal link
 * into the connected lesson, `class.wizcol.com/seat/:seatCode`. Made on the
 * first call and the same code ever after (reusable); also stored on the
 * caller's own registration as `seatCode`. Refused with reason `not-connected`
 * when no lesson uses the session, `not-registered` when the caller has no
 * registration, and `failed-precondition` once the session has ended.
 */
export interface TablesSeatLinkRequest {
	sessionId: string;
}
export interface TablesSeatLinkResponse {
	seatCode: string;
}

/**
 * `tablesJoinTable` (participant, direct mode of an older session). Atomic;
 * fails with `failed-precondition` when the table is full, and with reason
 * `split-by-topic` in a splitByTopic session (people choose a topic there).
 */
export interface TablesJoinTableRequest {
	sessionId: string;
	tableIndex: number;
}
export interface TablesJoinTableResponse {
	tableIndex: number;
	topicId: string;
}

/**
 * `tablesComputePreview` (host). Returns the id of the computed (or computing) run.
 * Refused with reason `too-few-registrants` below five people and `preview-limit`
 * after five previews over the same registrations and answers, or thirty in the
 * session. The seed is the server's own: a request carrying one is refused.
 */
export interface TablesComputePreviewRequest {
	sessionId: string;
}
export interface TablesComputePreviewResponse {
	runId: string;
}

/**
 * `tablesPublishRun` (host). Idempotent; refused when the run's input is stale.
 * Ranked sessions, and splitByTopic sessions once published (seating the
 * latecomers who found no free seat, after a `tablesComputePreview`).
 */
export interface TablesPublishRunRequest {
	sessionId: string;
	runId: string;
}
export interface TablesPublishRunResponse {
	publishedRunId: string;
}

/**
 * `tablesDeleteSession` (host, any status): deletes the session and everything
 * stored under it. Calling it for a session already gone succeeds.
 */
export interface TablesDeleteSessionRequest {
	sessionId: string;
}
export interface TablesDeleteSessionResponse {
	deleted: true;
}
