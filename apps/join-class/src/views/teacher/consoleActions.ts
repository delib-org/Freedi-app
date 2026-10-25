import type {
	ClassTableAction,
	ClassVoteDisplay,
	LessonStatusAction,
	Statement,
	TableStep,
} from '@freedi/shared-types';
import {
	classAddNoDevice,
	classAllTablesTo,
	classAssignTables,
	classCloseBallot,
	classFreezeBallot,
	classMoveStudent,
	classPauseBallot,
	classResetTurns,
	classResetVote,
	classSetItemHidden,
	classSetLessonStatus,
	classTableStep,
} from '@/lib/classroom/api';
import type { DropTarget } from '@/lib/classroom/dragReducer';
import { Collections } from '@freedi/shared-types';
import { db, doc, updateDoc } from '@/lib/firebase';
import { getLessonStep, setLessonStep } from '@/lib/lesson';
import { LESSON_STEP_KEYS, isLessonStanding, lessonStatusOfMain } from '@/lib/lessonCore';
import { clearsTableClocksOnEnter } from '@/lib/classroom/consoleHelpers';
import { getMainStatement, setQuestionSetting } from '@/lib/store';
import { t } from '@/lib/i18n';
import { act, consoleState } from './consoleState';

/** The machine-readable cause a classroom callable attached to its refusal, if any. */
function refusalReason(error: unknown): string | undefined {
	const details = (error as { details?: { reason?: unknown } } | null)?.details;

	return typeof details?.reason === 'string' ? details.reason : undefined;
}

/**
 * Every teacher action of the console, each through `act` so a failure (the
 * classroom callables may not be deployed yet) becomes an inline error with a
 * retry and never a crash.
 */

/**
 * A teacher action that moves the room. Refused while the lesson is paused or
 * ended (the callables refuse too; this keeps the click from ever leaving).
 */
function guardedAct(key: string, label: string, run: () => Promise<unknown>): Promise<boolean> {
	if (consoleState.held) return Promise.resolve(false);

	return act(key, label, run);
}

const PLENUM_PATCH = {
	statementSettings: { roundPhase: 'improve' },
} as Partial<Statement>;

export function goToStep(mainId: string, index: number): Promise<boolean> {
	return guardedAct(`step:${index}`, t('console.act_step'), async () => {
		const from = getLessonStep().index;
		await setLessonStep(mainId, index);
		if (!clearsTableClocksOnEnter(from, index, LESSON_STEP_KEYS)) return;
		// The step has moved; a failure here only leaves the old clock on the tables, so it must not undo the move.
		try {
			await classAllTablesTo({ mainId, step: 'talk' });
		} catch (error) {
			console.error(
				'[Console] clearing the table clocks failed',
				{ operation: 'goToStep', mainId },
				error,
			);
		}
	});
}

/**
 * The Opening step's projector choice: a video id, or null for the introduction
 * text. Cleared by every step move (planStepMove), so the next Opening starts on
 * the text. Refused while the lesson is paused or ended.
 */
async function setProjectorVideo(mainId: string, videoId: string | null): Promise<void> {
	const status = lessonStatusOfMain(getMainStatement());
	if (isLessonStanding(status)) {
		throw new Error(`The lesson is ${status}: the projector does not change`);
	}
	await updateDoc(doc(db, Collections.statements, mainId), {
		'statementSettings.lessonPlan.projectorVideoId': videoId,
		lastUpdate: Date.now(),
	});
}

/** The Opening step's "on the projector" choice, through `act` so a failure is an inline retry. */
export function pickProjectorVideo(mainId: string, videoId: string | null): Promise<boolean> {
	return guardedAct('projector:pick', t('console.opening.show'), () =>
		setProjectorVideo(mainId, videoId),
	);
}

export function assignTables(mainId: string, replace: boolean): Promise<boolean> {
	return guardedAct('assign', t(replace ? 'console.resplit' : 'console.split'), () =>
		classAssignTables({ mainId, replace }),
	);
}

export function allTablesTo(mainId: string, step: TableStep): Promise<boolean> {
	return guardedAct(`all:${step}`, t('console.all_tables_rate'), () =>
		classAllTablesTo({ mainId, step }),
	);
}

export function startPlenum(challengeId: string): Promise<boolean> {
	return guardedAct('plenum', t('console.plenum'), () =>
		setQuestionSetting(challengeId, PLENUM_PATCH),
	);
}

export function freezeBallot(mainId: string): Promise<boolean> {
	return guardedAct('freeze', t('console.open_vote'), () => classFreezeBallot({ mainId }));
}

/** Pause the vote (votes locked, kept) or resume it; closing stays the one final end. */
export function pauseBallot(mainId: string, paused: boolean): Promise<boolean> {
	return guardedAct('pauseVote', t(paused ? 'console.pause_vote' : 'console.resume_vote'), () =>
		classPauseBallot({ mainId, paused }),
	);
}

export function closeBallot(mainId: string): Promise<boolean> {
	return guardedAct('close', t('console.close_vote'), () => classCloseBallot({ mainId }));
}

/**
 * One of the lesson's vote switches (what the students' vote screen shows).
 * A display choice, so it works while the lesson is held too.
 */
export function setVoteDisplay(
	challengeId: string,
	field: keyof ClassVoteDisplay,
	value: boolean,
): Promise<boolean> {
	const patch = { statementSettings: { voteDisplay: { [field]: value } } } as Partial<Statement>;

	return act(`voteDisplay:${field}`, t('console.vote_settings'), () =>
		setQuestionSetting(challengeId, patch),
	);
}

export function moveStudent(mainId: string, uid: string, toTable: DropTarget): Promise<boolean> {
	return guardedAct(`move:${uid}`, t('console.move'), async () => {
		await classMoveStudent({ mainId, uid, toTable });
		consoleState.announce = t('console.moved', { table: toTable ?? t('console.unplaced_name') });
	});
}

export function addNoDevice(mainId: string, n: number, name: string): Promise<boolean> {
	return guardedAct(`nodevice:${n}`, t('console.add_no_device'), () =>
		classAddNoDevice({ mainId, n, name: name.trim() }),
	);
}

export function tableAction(tableId: string, action: ClassTableAction): Promise<boolean> {
	return guardedAct(`table:${tableId}:${action.action}`, t('console.table_action'), () =>
		classTableStep({ tableId, ...action }),
	);
}

/**
 * Hide or restore one result ("מה כתבו"). Server-side, so a proposal on an
 * open ballot leaves the ballot with it. Works while the lesson is paused.
 */
export function setHidden(statementId: string, hidden: boolean): Promise<boolean> {
	return act(
		`hide:${statementId}`,
		t(hidden ? 'console.hide' : 'console.restore'),
		() => classSetItemHidden({ mainId: consoleState.mainId, statementId, hidden }),
		(error) => (refusalReason(error) === 'vote-closed' ? t('console.hide_vote_closed') : undefined),
	);
}

/**
 * Give the turns back at Table talk: one table (`n`) or all. Works while the
 * lesson is paused; the server refuses an ended lesson.
 */
export function resetTurns(mainId: string, n?: number): Promise<boolean> {
	return act(
		`reset:turns:${n ?? 'all'}`,
		t(n === undefined ? 'console.reset_turns_all' : 'console.reset_turns_table'),
		() => classResetTurns({ mainId, ...(n === undefined ? {} : { n }) }),
	);
}

/** Delete every vote and the decision; the class votes again on the same proposals. */
export function resetVote(mainId: string): Promise<boolean> {
	return act('reset:vote', t('console.reset_vote'), () => classResetVote({ mainId }));
}

/**
 * Pause, resume, end, keep open or reopen the lesson (IA 13.6). The one family
 * of actions that works while the lesson is held, so it goes straight through
 * `act` and not through the guard above.
 */
export function changeLessonStatus(mainId: string, action: LessonStatusAction): Promise<boolean> {
	return act(`status:${action}`, t(STATUS_LABEL_KEY[action]), () =>
		classSetLessonStatus({ mainId, action }),
	);
}

const STATUS_LABEL_KEY: Record<LessonStatusAction, string> = {
	pause: 'console.pause',
	resume: 'console.resume',
	end: 'console.end_now',
	keepOpen: 'console.keep_open',
	reopen: 'teacher.row.reopen',
};
