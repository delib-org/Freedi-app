import type {
	ClassArriveByNameRequest,
	ClassArriveByNameResponse,
	ClassCloseRegistrationRequest,
	ClassCloseRegistrationResponse,
	ClassConnectRegistrationRequest,
	ClassConnectRegistrationResponse,
	ClassCopySeatingRequest,
	ClassCopySeatingResponse,
	ClassDisconnectRegistrationRequest,
	ClassDisconnectRegistrationResponse,
	ClassRegistrationSupportRequest,
	ClassRegistrationSupportResponse,
	ClassSeatByCodeRequest,
	ClassSeatByCodeResponse,
	ClassSupportBySideRequest,
	ClassSupportBySideResponse,
	ClassAddNoDeviceRequest,
	ClassAddNoDeviceResponse,
	ClassAllTablesToRequest,
	ClassAllTablesToResponse,
	ClassAssignTablesRequest,
	ClassAssignTablesResponse,
	ClassCastVoteForRequest,
	ClassCastVoteForResponse,
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
	ClassRequestRenameRequest,
	ClassRequestRenameResponse,
	ClassEnterTableTalkRequest,
	ClassEnterTableTalkResponse,
	ClassResetTurnsRequest,
	ClassResetTurnsResponse,
	ClassResetVoteRequest,
	ClassResetVoteResponse,
	ClassSetItemHiddenRequest,
	ClassSetItemHiddenResponse,
	ClassSetLessonRemovedRequest,
	ClassSetLessonRemovedResponse,
	ClassSetLessonStatusRequest,
	ClassSetLessonStatusResponse,
	ClassTableStepRequest,
	ClassTableStepResponse,
} from '@freedi/shared-types';
import { functions, httpsCallable } from '../firebase';
import { captureException } from '../sentry';
import { isRaceRefusal } from './turnMoment';

/**
 * Typed wrappers around the classroom callables (region me-west1 — the shared
 * `functions` instance in lib/firebase.ts is already pinned to it). The
 * implementations live in functions/src/classroom (lane C1); until they are
 * deployed every call rejects with `functions/not-found`, which callers should
 * treat like any other failure. Errors are logged with a [Classroom] tag and
 * rethrown so the view can show its own message.
 */

export async function call<Req, Res>(name: string, payload: Req): Promise<Res> {
	try {
		const result = await httpsCallable<Req, Res>(functions, name)(payload);

		return result.data;
	} catch (error) {
		// "Someone was first" is an expected race the screen already shows, not a failure.
		if (!isRaceRefusal(error)) captureException(error, { operation: `classroom.${name}` });
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

/** Admin: ask one student for a new name; a name form blocks their phone until they save one. */
export function classRequestRename(
	req: ClassRequestRenameRequest,
): Promise<ClassRequestRenameResponse> {
	return call('classRequestRename', req);
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

/** Admin: take a lesson off the lists, or put it back. Refused while the lesson is running. */
export function classSetLessonRemoved(
	req: ClassSetLessonRemovedRequest,
): Promise<ClassSetLessonRemovedResponse> {
	return call('classSetLessonRemoved', req);
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

/** Admin, right after the move to Table talk: every table starts the step clean. */
export function classEnterTableTalk(
	req: ClassEnterTableTalkRequest,
): Promise<ClassEnterTableTalkResponse> {
	return call('classEnterTableTalk', req);
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

/**
 * A student: a proposal, after the language check (IA 24.3); hurtful words answer { ok: false }.
 * The teacher, with `forStudentId`: the proposal of a student without a device.
 */
export function classPostProposal(
	req: ClassPostProposalRequest,
): Promise<ClassPostProposalResponse> {
	return call('classPostProposal', req);
}

/** The lesson's teacher: the vote of a student without a device, while the ballot takes votes. */
export function classCastVoteFor(req: ClassCastVoteForRequest): Promise<ClassCastVoteForResponse> {
	return call('classCastVoteFor', req);
}

/** The proposal's writer: new text, same check, until the vote opens (IA 24.3). */
export function classEditProposal(
	req: ClassEditProposalRequest,
): Promise<ClassEditProposalResponse> {
	return call('classEditProposal', req);
}

// ---- the Tables-Class bridge (IA tables-class-bridge) -----------------------

/** Admin, who also hosts the registration: connect it to this lesson (idempotent). */
export function classConnectRegistration(
	req: ClassConnectRegistrationRequest,
): Promise<ClassConnectRegistrationResponse> {
	return call('classConnectRegistration', req);
}

/** Admin: remove the connection, until the seating is copied (else reason `seating-copied`). */
export function classDisconnectRegistration(
	req: ClassDisconnectRegistrationRequest,
): Promise<ClassDisconnectRegistrationResponse> {
	return call('classDisconnectRegistration', req);
}

/** Admin, at the Tables step: bring the published tables into the lesson (`replace` = "עדכון מההרשמה"). */
export function classCopySeating(req: ClassCopySeatingRequest): Promise<ClassCopySeatingResponse> {
	return call('classCopySeating', req);
}

/** Admin: close the registration from Class (the same server path as Tables). */
export function classCloseRegistration(
	req: ClassCloseRegistrationRequest,
): Promise<ClassCloseRegistrationResponse> {
	return call('classCloseRegistration', req);
}

/** Anyone signed in: exchange a personal link's code for the seat. */
export function classSeatByCode(req: ClassSeatByCodeRequest): Promise<ClassSeatByCodeResponse> {
	return call('classSeatByCode', req);
}

/** Anyone signed in: the name gate of a connected lesson. */
export function classArriveByName(
	req: ClassArriveByNameRequest,
): Promise<ClassArriveByNameResponse> {
	return call('classArriveByName', req);
}

/** Admin (or a member when the challenge shows support to everyone): support by the registration's poles. */
export function classRegistrationSupport(
	req: ClassRegistrationSupportRequest,
): Promise<ClassRegistrationSupportResponse> {
	return call('classRegistrationSupport', req);
}

/** Admin (or a member when the challenge shows support to everyone), at Vote / Summary: the lesson's own support by side. */
export function classSupportBySide(
	req: ClassSupportBySideRequest,
): Promise<ClassSupportBySideResponse> {
	return call('classSupportBySide', req);
}
