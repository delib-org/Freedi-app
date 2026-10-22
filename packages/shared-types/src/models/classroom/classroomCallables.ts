import type { TableStep, WritingMode } from './classroomModel';

/**
 * Wire contracts of the join-class callables (region me-west1, App Check).
 * Clients (apps/join-class/src/lib/classroom/api.ts) and functions
 * (functions/src/classroom) both import these; drift is a compile error.
 * Actor rules: admin of the workspace unless stated otherwise.
 */

export type ClassTableSize = 3 | 4 | 5;

/** `classAssignTables` (admin). Round-robin by camp; re-running replaces tables only with `replace: true`. */
export interface ClassAssignTablesRequest {
	mainId: string;
	tableSize?: ClassTableSize;
	replace?: boolean;
}
export interface ClassAssignTablesResponse {
	tables: number;
	placed: number;
}

/** `classMoveStudent` (admin). `toTable: null` unseats the student. */
export interface ClassMoveStudentRequest {
	mainId: string;
	uid: string;
	toTable: number | null;
}
export interface ClassMoveStudentResponse {
	ok: true;
}

/** `classAddNoDevice` (admin). Adds a named student without a phone to table `n`. */
export interface ClassAddNoDeviceRequest {
	mainId: string;
	n: number;
	name: string;
}
export interface ClassAddNoDeviceResponse {
	id: string;
}

/** `classTableStep` (actor = the table's asker or an admin). A timer ending never advances anything. */
export type ClassTableAction =
	| { action: 'pickQuestion'; questionId: string }
	| { action: 'toTalk' }
	| { action: 'nextSpeaker'; uid: string }
	| { action: 'toWrite' }
	| { action: 'setWritingMode'; mode: WritingMode }
	| { action: 'toRate' }
	/** `fromTurn`: the turn the claimer saw; a claim that arrives after the table moved on is refused. */
	| { action: 'nextTurn'; fromTurn?: number }
	| { action: 'passAsker'; uid: string };

export type ClassTableStepRequest = { tableId: string } & ClassTableAction;
export interface ClassTableStepResponse {
	step: TableStep;
	turn: number;
}

/** `classAllTablesTo` (admin). */
export interface ClassAllTablesToRequest {
	mainId: string;
	step: TableStep;
}
export interface ClassAllTablesToResponse {
	updated: number;
}

/** `classFreezeBallot` (admin). Candidates: options above the gate, else the top N. */
export interface ClassFreezeBallotRequest {
	mainId: string;
	topN?: number;
}
export interface ClassFreezeBallotResponse {
	candidateIds: string[];
	frozenAt: number;
}

/** `classCloseBallot` (admin). Writes ballot.closedAt and ballot.decisionId (see decideBallot). */
export interface ClassCloseBallotRequest {
	mainId: string;
}
export interface ClassCloseBallotResponse {
	decisionId: string | null;
	closedAt: number;
}

/**
 * `classSetLessonStatus` (admin). The lesson's status moves live <-> paused,
 * live/paused/open -> ended or open, ended -> live. Same-target repeats are
 * no-ops (a retry after a dropped reply is safe); any other move answers
 * failed-precondition. 'resume' shifts every table's speakerEndsAt by the
 * pause length.
 */
export type LessonStatusAction = 'pause' | 'resume' | 'end' | 'keepOpen' | 'reopen';
export interface ClassSetLessonStatusRequest {
	mainId: string;
	action: LessonStatusAction;
}
export interface ClassSetLessonStatusResponse {
	status: 'live' | 'paused' | 'open' | 'ended';
	statusAt: number;
}
