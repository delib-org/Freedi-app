import { askerMayAnswer, everyoneSpoke, speakerTimeOver } from '@freedi/shared-types';
import type { ClassTable, ClassTableAction, LessonStepKey, TableStep } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

/**
 * Who may run which table action, from which step (IA 16 rev 3). Pure guards
 * of the state machine in tableTransitions.ts.
 */

export type ActorRole = 'admin' | 'asker' | 'member';

export interface TransitionContext {
	actorUid: string;
	/** Admin of the workspace (teacher / co-teacher). */
	isAdmin: boolean;
	/** Server clock, epoch ms. */
	now: number;
	/** The lesson's current step (lessonPlan.steps[stepIndex]), read with the table; null/absent when unknown. */
	lessonStep?: LessonStepKey | null;
	/** The picked question is a table's own question (it has a `classTable`); set for pickQuestion / claimTurn. */
	questionIsOwn?: boolean;
	/** The lesson lets students add their own question (`allowOwnQuestionsOf(main)`); absent = yes. */
	allowOwnQuestions?: boolean;
}

/** From which steps the asker (or a tablemate, where allowed) may run each action. */
export const ALLOWED_FROM: Record<ClassTableAction['action'], readonly TableStep[]> = {
	pickQuestion: ['pick'],
	toTalk: ['pick'],
	nextSpeaker: ['talk'],
	toWrite: ['pick', 'talk'],
	setWritingMode: ['pick', 'talk', 'write'],
	toRate: ['talk', 'write'],
	// pick: V1 (nobody asks); talk: V2 (everyone spoke); rate: a table that was mid-turn before v2.
	nextTurn: ['pick', 'talk', 'rate'],
	passAsker: ['pick'],
	passAsking: ['pick', 'talk', 'write', 'rate'],
	passSpeaking: ['talk'],
	// pick: the normal start (or a legacy table with an asker still choosing); talk/write/rate: the next turn.
	claimTurn: ['pick', 'talk', 'write', 'rate'],
	claimSpeaker: ['talk'],
	finishSpeaking: ['talk'],
};

/**
 * Admins (the teacher's console: "לכתיבה · לדירוג", moving a stuck table) may
 * jump a table to talk / write / rate or start the next turn from any step.
 * Actions whose meaning depends on the step (pick a question, choose the next
 * speaker, change the writing mode) keep their preconditions for everyone.
 */
const ADMIN_FROM_ANY_STEP: ReadonlySet<ClassTableAction['action']> = new Set([
	'toTalk',
	'toWrite',
	'toRate',
	'nextTurn',
]);

/** Teacher-only actions: the asker and tablemates never run them. */
const ADMIN_ONLY: ReadonlySet<ClassTableAction['action']> = new Set(['passAsker']);

/** Moves a plain tablemate may run when nobody asks (the asker left): IA 16.7 E8. */
const ASKERLESS_MEMBER_MOVES: ReadonlySet<ClassTableAction['action']> = new Set([
	'nextSpeaker',
	'toWrite',
	'toRate',
]);

export function actorRole(table: ClassTable, ctx: TransitionContext): ActorRole | null {
	if (ctx.isAdmin) return 'admin';
	if (table.askerUid && table.askerUid === ctx.actorUid) return 'asker';
	if (table.memberUids.includes(ctx.actorUid)) return 'member';

	return null;
}

export function listOf(uids: string[] | undefined): string[] {
	return uids ?? [];
}

/** A seated tablemate (an admin who is not seated cannot claim, answer or pass as a student). */
function assertSeated(table: ClassTable, actorUid: string): void {
	if (!table.memberUids.includes(actorUid)) {
		throw new ClassroomError('permission-denied', 'You are not seated at this table');
	}
}

/**
 * A tablemate may claim the turn ("I want to start") once, when the table is
 * choosing: at pick, or at talk with everyone answered; a table left at
 * write/rate before v3 still allows it. Checked in this order so a forged or
 * stale tap gets the most telling refusal.
 */
function assertMayClaimTurn(
	table: ClassTable,
	action: Extract<ClassTableAction, { action: 'claimTurn' }>,
	actorUid: string,
	now: number,
	lessonStep: LessonStepKey | null | undefined,
): void {
	assertSeated(table, actorUid);
	if (lessonStep !== 'tableTalk') {
		throw new ClassroomError('failed-precondition', 'A turn can only be claimed at Table talk');
	}
	if (listOf(table.askedUids).includes(actorUid)) {
		throw new ClassroomError('permission-denied', 'You have already asked', 'already-asked');
	}
	if (listOf(table.passedAskingUids).includes(actorUid)) {
		throw new ClassroomError('permission-denied', 'You passed on asking', 'already-passed');
	}
	// A claim names the turn it saw: without it a delayed tap could take a later hand-off.
	if (typeof action.fromTurn !== 'number') {
		throw new ClassroomError('invalid-argument', 'A claim must name the turn it saw (fromTurn)');
	}
	if (action.fromTurn !== table.turn) {
		throw new ClassroomError(
			'failed-precondition',
			'Another tablemate already took the turn',
			'turn-claimed',
		);
	}
	if (table.step === 'talk' && !everyoneSpoke(table, now)) {
		// Nobody has answered yet: the loser of a race. Otherwise a tap in the middle of a turn.
		const justClaimed = table.spokenUids.length === 0 && !table.speakerUid;
		throw new ClassroomError(
			'failed-precondition',
			justClaimed
				? 'Another tablemate already took the turn'
				: 'The table has not finished talking',
			justClaimed ? 'turn-claimed' : 'talk-not-over',
		);
	}
	if (table.usedQuestionIds.includes(action.questionId)) {
		throw new ClassroomError(
			'failed-precondition',
			'This question was already asked at this table',
			'question-used',
		);
	}
}

/**
 * With own questions off (IA 25.4) a table cannot ask a question a student
 * wrote: refused as `own-questions-off`, so the phone redraws without the row.
 */
export function assertOwnQuestionAllowed(action: ClassTableAction, ctx: TransitionContext): void {
	if (action.action !== 'pickQuestion' && action.action !== 'claimTurn') return;
	if (ctx.questionIsOwn === true && ctx.allowOwnQuestions === false) {
		throw new ClassroomError(
			'failed-precondition',
			'Students cannot ask their own questions in this lesson',
			'own-questions-off',
		);
	}
}

/** Everyone who answered or passed this question, the finished speaker included. */
export function answeredUids(table: ClassTable, now: number): Set<string> {
	const done = new Set(table.spokenUids);
	if (table.speakerUid && table.speakerEndsAt !== undefined && table.speakerEndsAt <= now) {
		done.add(table.speakerUid);
	}

	return done;
}

/**
 * Proposals / talk (Tal, 2026-10-25): every speaker gets a fresh minute, any
 * number of times, with no question on the table. Only the floor is guarded.
 */
function assertMayClaimProposalsSpeaker(table: ClassTable, actorUid: string, now: number): void {
	assertSeated(table, actorUid);
	if (!speakerTimeOver(table, now)) {
		throw new ClassroomError('failed-precondition', 'Someone is speaking', 'floor-taken');
	}
}

function assertMayClaimSpeaker(
	table: ClassTable,
	actorUid: string,
	now: number,
	lessonStep: LessonStepKey | null | undefined,
): void {
	if (lessonStep === 'proposals') {
		assertMayClaimProposalsSpeaker(table, actorUid, now);

		return;
	}
	assertSeated(table, actorUid);
	if (!table.questionId) {
		throw new ClassroomError('failed-precondition', 'No question is being answered');
	}
	if (!speakerTimeOver(table, now)) {
		throw new ClassroomError('failed-precondition', 'Someone is answering', 'floor-taken');
	}
	if (answeredUids(table, now).has(actorUid)) {
		throw new ClassroomError('failed-precondition', 'You already answered', 'already-answered');
	}
	if (table.askerUid === actorUid && !askerMayAnswer(table, now)) {
		throw new ClassroomError('failed-precondition', 'Let others answer first', 'others-first');
	}
}

/** The speaker ends their own minute; so does a teacher. */
function assertMayFinish(
	table: ClassTable,
	role: ActorRole | null,
	actorUid: string,
	now: number,
): void {
	if (role !== 'admin' && table.speakerUid !== actorUid) {
		throw new ClassroomError('permission-denied', 'Only the speaker can finish', 'not-speaker');
	}
	if (!table.speakerUid || speakerTimeOver(table, now)) {
		throw new ClassroomError('failed-precondition', 'The minute is over', 'minute-over');
	}
}

/** A member passes only for themselves; the target checks need the table, so they run in the transition. */
export function assertMayPassAsking(action: ClassTableAction, actorUid: string): void {
	if (action.action === 'passAsking' && action.uid !== undefined && action.uid !== actorUid) {
		throw new ClassroomError('permission-denied', 'Only a teacher can pass for someone else');
	}
}

/** Table talk = the lesson is at Table talk (or, when unknown, the table has a question). */
export function isTableTalk(
	table: ClassTable,
	lessonStep: LessonStepKey | null | undefined,
): boolean {
	return lessonStep ? lessonStep === 'tableTalk' : !!table.questionId;
}

/**
 * Table talk (a question is on the table): a member passes only for themselves,
 * an admin names `uid`. Proposals: the speaker passes their own minute, the
 * asker on their behalf.
 */
function assertMayPassSpeaking(
	role: ActorRole | null,
	table: ClassTable,
	action: Extract<ClassTableAction, { action: 'passSpeaking' }>,
	actorUid: string,
	lessonStep: LessonStepKey | null | undefined,
): void {
	if (role === 'admin') return;
	if (isTableTalk(table, lessonStep)) {
		assertSeated(table, actorUid);
		if (action.uid !== undefined && action.uid !== actorUid) {
			throw new ClassroomError('permission-denied', 'Only a teacher can pass for someone else');
		}

		return;
	}
	if (role === 'asker' || actorUid === table.speakerUid) return;
	throw new ClassroomError(
		'permission-denied',
		'Only the speaker, the asker or a teacher can pass a minute',
		'not-speaker',
	);
}

/**
 * May this actor run this action now? The asker holds the table's controls;
 * a plain tablemate may pick the next speaker once the current minute is over
 * ("הבא בתור", so a table is never stuck) and, at a table nobody asks at (the
 * asker left), run the asker's moves.
 */
export function assertMayAct(
	role: ActorRole | null,
	action: ClassTableAction,
	table: ClassTable,
	now: number,
	actorUid: string,
	lessonStep: LessonStepKey | null | undefined,
): void {
	// The student actions of Table talk: seated tablemates for themselves, whatever the role.
	switch (action.action) {
		case 'claimTurn':
			assertMayClaimTurn(table, action, actorUid, now, lessonStep);

			return;
		case 'claimSpeaker':
			assertMayClaimSpeaker(table, actorUid, now, lessonStep);

			return;
		case 'finishSpeaking':
			assertMayFinish(table, role, actorUid, now);

			return;
		default:
			break;
	}
	if (role === 'admin') {
		if (action.action === 'passSpeaking') {
			assertMayPassSpeaking(role, table, action, actorUid, lessonStep);
		}

		return;
	}
	if (ADMIN_ONLY.has(action.action)) {
		throw new ClassroomError('permission-denied', 'Only a teacher can do this');
	}
	switch (action.action) {
		case 'nextTurn':
			// Members start a turn with `claimTurn`; `nextTurn` only opens a pick for the teacher.
			throw new ClassroomError('permission-denied', 'Only a teacher can open the next pick');
		case 'passAsking':
			assertMayPassAsking(action, actorUid);

			return;
		case 'passSpeaking':
			assertMayPassSpeaking(role, table, action, actorUid, lessonStep);

			return;
		case 'nextSpeaker':
			if (isTableTalk(table, lessonStep)) {
				throw new ClassroomError('permission-denied', 'Only a teacher can give the next minute');
			}
			break;
		default:
			break;
	}
	if (role === 'asker') return;
	if (role === 'member') {
		if (action.action === 'nextSpeaker' && table.speakerUid && speakerTimeOver(table, now)) return;
		if (action.action === 'toWrite' && table.step === 'talk' && everyoneSpoke(table, now)) return;
		const askerless = table.askerUid === null && (table.step === 'talk' || table.step === 'write');
		if (askerless && ASKERLESS_MEMBER_MOVES.has(action.action)) return;
		// A table that reaches Proposals without a turn (everyone passed, or none started) sits at pick with
		// nobody asking: its tablemates must still be able to leave for writing.
		// Only while the lesson is at Proposals: at Table talk the same state is the normal wait for a pick.
		if (
			table.askerUid === null &&
			table.step === 'pick' &&
			action.action === 'toWrite' &&
			lessonStep === 'proposals'
		) {
			return;
		}
	}
	throw new ClassroomError('permission-denied', "Only the table's asker or a teacher can do this");
}

/** The speaker minute at Proposals/talk is a per-phone sub-step: it runs whatever step the table doc is at. */
const PROPOSALS_ANY_STEP: ReadonlySet<ClassTableAction['action']> = new Set([
	'claimSpeaker',
	'finishSpeaking',
]);

export function assertFromStep(
	role: ActorRole | null,
	action: ClassTableAction,
	table: ClassTable,
	lessonStep?: LessonStepKey | null,
): void {
	if (lessonStep === 'proposals' && PROPOSALS_ANY_STEP.has(action.action)) return;
	if (role === 'admin' && ADMIN_FROM_ANY_STEP.has(action.action)) return;
	if (!ALLOWED_FROM[action.action].includes(table.step)) {
		throw new ClassroomError(
			'failed-precondition',
			`${action.action} is not allowed while the table is at '${table.step}'`,
		);
	}
}
