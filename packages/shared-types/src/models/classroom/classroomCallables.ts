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
	/** Table talk: the teacher only; `uid` may be a no-device member id. Proposals: asker/member as before. */
	| { action: 'nextSpeaker'; uid: string }
	| { action: 'toWrite' }
	| { action: 'setWritingMode'; mode: WritingMode }
	| { action: 'toRate' }
	/**
	 * `fromTurn`: the turn the claimer saw; a claim that arrives after the table moved on is refused.
	 * Required for a member's claim (the engine refuses one without it); a teacher's need not send it.
	 */
	| { action: 'nextTurn'; fromTurn?: number }
	/**
	 * Table talk (IA 16 rev 3): "I want to start". One transaction: the caller becomes the asker,
	 * `questionId` is locked for the table and the step moves to talk. `fromTurn` is the turn the
	 * claimer saw (required). First write wins.
	 */
	| { action: 'claimTurn'; fromTurn: number; questionId: string }
	/** Table talk: "I want to answer". Takes the floor for SPEAK_SECONDS when nobody holds it. */
	| { action: 'claimSpeaker' }
	/** Table talk: end one's own minute early (the speaker, or an admin). */
	| { action: 'finishSpeaking' }
	| { action: 'passAsker'; uid: string }
	/** Pass on asking: a member for themselves, or an admin naming `uid`. */
	| { action: 'passAsking'; uid?: string }
	/**
	 * Pass answering. Table talk: a member for themselves before speaking, or an admin naming `uid`
	 * (also ends a running minute as passed). Proposals: the speaker, the asker or an admin end the running minute.
	 */
	| { action: 'passSpeaking'; uid?: string };

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

/**
 * `classPauseBallot` (admin). `paused: true` sets ballot.pausedAt (votes are
 * locked, nobody votes or changes a vote); `false` clears it and voting goes
 * on with the same votes. Refused before the ballot is open and after it is
 * closed. Same-target repeats are no-ops.
 */
export interface ClassPauseBallotRequest {
	mainId: string;
	paused: boolean;
}
export interface ClassPauseBallotResponse {
	pausedAt: number | null;
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

/**
 * `classCloneLesson` (admin of the source). A new lesson with the source's plan:
 * questions (text, role, hint, order), intro paragraphs, intro videos, side
 * names, lesson language. Never the class work (students, tables, answers,
 * ballot, progress). `newMainId` is made by the client and kept while its form
 * is open: a repeat with the same id returns the same lesson (`reused: true`).
 */
export interface ClassCloneLessonRequest {
	sourceMainId: string;
	newMainId: string;
	/** Name of the new lesson; the source's title when omitted. */
	title?: string;
}
export interface ClassCloneLessonResponse {
	mainId: string;
	classCode: string;
	reused: boolean;
}
