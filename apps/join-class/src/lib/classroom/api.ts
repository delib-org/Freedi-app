import type {
	ClassAddNoDeviceRequest,
	ClassAddNoDeviceResponse,
	ClassAllTablesToRequest,
	ClassAllTablesToResponse,
	ClassAssignTablesRequest,
	ClassAssignTablesResponse,
	ClassSnapshotGameRequest,
	ClassSnapshotGameResponse,
	ClassStartLessonRequest,
	ClassStartLessonResponse,
	ClassCloseBallotRequest,
	ClassCloseBallotResponse,
	ClassFreezeBallotRequest,
	ClassFreezeBallotResponse,
	ClassMoveStudentRequest,
	ClassPauseBallotRequest,
	ClassPauseBallotResponse,
	ClassEditProposalRequest,
	ClassEditProposalResponse,
	ClassPostProposalRequest,
	ClassPostProposalResponse,
	ClassPostReplyRequest,
	ClassPostReplyResponse,
	ClassMoveStudentResponse,
	ClassResetTurnsRequest,
	ClassResetTurnsResponse,
	ClassResetVoteRequest,
	ClassResetVoteResponse,
	ClassSetItemHiddenRequest,
	ClassSetItemHiddenResponse,
	ClassSetLessonStatusRequest,
	ClassSetLessonStatusResponse,
	ClassTableStepRequest,
	ClassTableStepResponse,
} from '@freedi/shared-types';
import { functions, httpsCallable } from '../firebase';

/**
 * Typed wrappers around the classroom callables (region me-west1 — the shared
 * `functions` instance in lib/firebase.ts is already pinned to it). The
 * implementations live in functions/src/classroom (lane C1); until they are
 * deployed every call rejects with `functions/not-found`, which callers should
 * treat like any other failure. Errors are logged with a [Classroom] tag and
 * rethrown so the view can show its own message.
 */

async function call<Req, Res>(name: string, payload: Req): Promise<Res> {
	try {
		const result = await httpsCallable<Req, Res>(functions, name)(payload);

		return result.data;
	} catch (error) {
		console.error(`[Classroom] ${name} failed:`, error);
		throw error;
	}
}

/** Admin: seat the joined students (round-robin by camp). `replace: true` to re-run. */
export function classAssignTables(
	req: ClassAssignTablesRequest,
): Promise<ClassAssignTablesResponse> {
	return call('classAssignTables', req);
}

/** Admin: move one student to table `toTable` (1-based) or unseat with `null`. */
export function classMoveStudent(req: ClassMoveStudentRequest): Promise<ClassMoveStudentResponse> {
	return call('classMoveStudent', req);
}

/** Admin: add a student without a device to table `n`. */
export function classAddNoDevice(req: ClassAddNoDeviceRequest): Promise<ClassAddNoDeviceResponse> {
	return call('classAddNoDevice', req);
}

/** Asker or admin: advance one table (see ClassTableAction). */
export function classTableStep(req: ClassTableStepRequest): Promise<ClassTableStepResponse> {
	return call('classTableStep', req);
}

/** Admin: put every table on `step`. */
export function classAllTablesTo(req: ClassAllTablesToRequest): Promise<ClassAllTablesToResponse> {
	return call('classAllTablesTo', req);
}

/** Admin: freeze the ballot shortlist (options above the gate, else top N). */
export function classFreezeBallot(
	req: ClassFreezeBallotRequest,
): Promise<ClassFreezeBallotResponse> {
	return call('classFreezeBallot', req);
}

/** Admin: pause the vote (votes locked, kept) or resume it. */
export function classPauseBallot(req: ClassPauseBallotRequest): Promise<ClassPauseBallotResponse> {
	return call('classPauseBallot', req);
}

/** Admin: close the ballot and record the decision. */
export function classCloseBallot(req: ClassCloseBallotRequest): Promise<ClassCloseBallotResponse> {
	return call('classCloseBallot', req);
}

/** Admin: pause, resume, end, keep open or reopen the lesson (IA 13.6). */
export function classSetLessonStatus(
	req: ClassSetLessonStatusRequest,
): Promise<ClassSetLessonStatusResponse> {
	return call('classSetLessonStatus', req);
}

/** Owner of the plan: play a prepared game with a class (or none). Safe to repeat with the same `newMainId`. */
export function classStartLesson(req: ClassStartLessonRequest): Promise<ClassStartLessonResponse> {
	return call('classStartLesson', req);
}

/** Admin of an old lesson, owner of the plan: turn the lesson's questions into a game of the plan. Safe to repeat with the same `newGameId`. */
export function classSnapshotGame(
	req: ClassSnapshotGameRequest,
): Promise<ClassSnapshotGameResponse> {
	return call('classSnapshotGame', req);
}

/** Admin, at Table talk: give the turns back to every table, or to table `n` (IA 18.4). */
export function classResetTurns(req: ClassResetTurnsRequest): Promise<ClassResetTurnsResponse> {
	return call('classResetTurns', req);
}

/** Admin: delete every vote and the decision; the same proposals stay on the ballot (IA 18.4). */
export function classResetVote(req: ClassResetVoteRequest): Promise<ClassResetVoteResponse> {
	return call('classResetVote', req);
}

/** Admin: hide or restore one answer, proposal or table question (IA 18.4). */
export function classSetItemHidden(
	req: ClassSetItemHiddenRequest,
): Promise<ClassSetItemHiddenResponse> {
	return call('classSetItemHidden', req);
}

/** A member or the teacher: one reply on a proposal (IA 22); hurtful words answer { ok: false }. */
export function classPostReply(req: ClassPostReplyRequest): Promise<ClassPostReplyResponse> {
	return call('classPostReply', req);
}

/** A student: their one proposal, after the language check (IA 24.3); hurtful words answer { ok: false }. */
export function classPostProposal(
	req: ClassPostProposalRequest,
): Promise<ClassPostProposalResponse> {
	return call('classPostProposal', req);
}

/** The proposal's writer: new text, same check, until the vote opens (IA 24.3). */
export function classEditProposal(
	req: ClassEditProposalRequest,
): Promise<ClassEditProposalResponse> {
	return call('classEditProposal', req);
}
