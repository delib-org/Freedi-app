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
	/** Table talk: "I want to answer". Takes the floor for the lesson's speaking time when nobody holds it. */
	| { action: 'claimSpeaker' }
	/** Table talk: end one's own minute early (the speaker, or an admin). */
	| { action: 'finishSpeaking' }
	| { action: 'passAsker'; uid: string }
	/** Pass on asking: a member for themselves, or an admin naming `uid`. */
	| { action: 'passAsking'; uid?: string }
	/**
	 * Pass answering. Table talk: a member for themselves before speaking, or an admin naming `uid`
	 * (also ends a running minute as passed). Proposals: the speaker, the asker or an admin end the
	 * running minute; a seated member who has not spoken this turn passes their turn (IA 25.6).
	 */
	| { action: 'passSpeaking'; uid?: string }
	/**
	 * Proposals (IA 25.6, admin only), while the table talks: open the next turn now:
	 * `proposalsTurn + 1`, `spokenUids = []`, the speaker cleared. The table's maximum grows
	 * with it, so a done table re-opens. `fromTurn` is the turn the teacher saw: a tap that
	 * arrives after the table already moved on is a no-op (a double tap advances once).
	 */
	| { action: 'nextProposalsTurn'; fromTurn?: number };

export type ClassTableStepRequest = { tableId: string } & ClassTableAction;
export interface ClassTableStepResponse {
	step: TableStep;
	turn: number;
}

/**
 * `classAllTablesTo` (admin). A move to `talk` starts the speakers afresh: at
 * Proposals it sets `proposalsTurn = 1` (entering the step), or with `newTurn`
 * opens the next turn at every table ("another turn, all tables", IA 25.6).
 * `fromTurns` (tableId -> the turn the console saw) makes `newTurn` idempotent:
 * a table whose turn moved on since is skipped, so a double tap or two consoles
 * advance each table once. `updated` counts the tables advanced.
 */
export interface ClassAllTablesToRequest {
	mainId: string;
	step: TableStep;
	newTurn?: boolean;
	fromTurns?: Record<string, number>;
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
 * `classResetTurns` (admin, IA 18.4). Table talk only. No `n` = every table of the
 * lesson. Gives the turns back (asker, asked, passed, used questions, speaker);
 * members, answers and ratings stay.
 */
export interface ClassResetTurnsRequest {
	mainId: string;
	n?: number;
}
export interface ClassResetTurnsResponse {
	reset: number;
}

/**
 * `classResetVote` (admin, IA 18.4). Deletes every vote, the tally and the decision;
 * the same candidates stay on the ballot, ready to vote again. Refused while the
 * vote is running.
 */
export interface ClassResetVoteRequest {
	mainId: string;
}
export interface ClassResetVoteResponse {
	votesDeleted: number;
}

/**
 * `classSetItemHidden` (admin, IA 18.4). Hides or restores one answer, proposal,
 * table question or reply on a proposal (IA 22: moves the proposal's
 * replyCount). Hiding a candidate on an open ballot also takes it off the
 * ballot and turns its votes into `none`.
 */
export interface ClassSetItemHiddenRequest {
	mainId: string;
	statementId: string;
	hidden: boolean;
}
export interface ClassSetItemHiddenResponse {
	hidden: boolean;
	/** Votes turned into `none` because the item left an open ballot. */
	votesWithdrawn: number;
}

/**
 * `classPostReply` (a member of the lesson, or its teacher; IA 22). Writes one
 * reply under a proposal of the lesson's challenge question, after the AI
 * language check (skipped for the teacher). `replyId` is chosen by the client
 * so a retry after a dropped answer never posts twice. A refused text answers
 * `{ ok: false, reason: 'language' }` (no error) and nothing is written.
 */
export interface ClassPostReplyRequest {
	mainId: string;
	proposalId: string;
	replyId: string;
	text: string;
}
export type ClassPostReplyResponse =
	| { ok: true; replyId: string }
	| { ok: false; reason: 'language' };

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
