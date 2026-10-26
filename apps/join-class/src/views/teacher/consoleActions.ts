import type {
	ClassTableAction,
	ClassVoteOrder,
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
import { Collections, proposalsTurnOf } from '@freedi/shared-types';
import { db, doc, updateDoc } from '@/lib/firebase';
import { getLessonStep, getLessonSteps, setLessonStep } from '@/lib/lesson';
import { isLessonStanding, lessonStatusOfMain } from '@/lib/lessonCore';
import { clearsTableClocksOnEnter, splitsTablesOnEnter } from '@/lib/classroom/consoleHelpers';
import { classState } from '@/lib/classroom/classState';
import { getMainStatement, setMainStatementSetting, setQuestionSetting } from '@/lib/store';
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

/** Tables already exist: the callable refuses a split without `replace` (a race with another tab). */
function isAlreadySplit(error: unknown): boolean {
	return (error as { code?: unknown } | null)?.code === 'functions/already-exists';
}

/**
 * Seat the class when a step opens and it has no tables (IA 25.3). The step has
 * moved already; a failure leaves the manual "חלוקה לשולחנות" button to retry
 * and never undoes the move.
 */
async function splitOnEnter(mainId: string): Promise<void> {
	try {
		await classAssignTables({ mainId, replace: false });
	} catch (error) {
		if (isAlreadySplit(error)) return;
		consoleState.failure = {
			label: t('console.split'),
			retry: () => void assignTables(mainId, false),
		};
		console.error('[Console] automatic split failed', { operation: 'goToStep', mainId }, error);
	}
}

export async function goToStep(mainId: string, index: number): Promise<boolean> {
	let splits = false;
	const moved = await guardedAct(`step:${index}`, t('console.act_step'), async () => {
		const from = getLessonStep().index;
		splits = splitsTablesOnEnter(from, index, getLessonSteps(), classState.tables.length > 0);
		await setLessonStep(mainId, index);
		if (!clearsTableClocksOnEnter(from, index, getLessonSteps())) return;
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
	// After `act`, which clears the failure line on success: a failed split shows its own retry.
	if (moved && splits) await splitOnEnter(mainId);

	return moved;
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
	return guardedAct('assign', t(replace ? 'console.resplit' : 'console.split'), async () => {
		try {
			await classAssignTables({ mainId, replace });
		} catch (error) {
			// The class is seated already (another tab, or the automatic split): what the teacher asked for.
			if (!replace && isAlreadySplit(error)) return;
			throw error;
		}
	});
}

export function allTablesTo(mainId: string, step: TableStep): Promise<boolean> {
	return guardedAct(`all:${step}`, t('console.all_tables_rate'), () =>
		classAllTablesTo({ mainId, step }),
	);
}

/**
 * Proposals (IA 25.6): "another turn, all tables": the next turn at every table,
 * speakers afresh. Sends the turn the console sees at each table, so a double
 * tap or a second console advances each table once.
 */
export function allTablesNewTurn(mainId: string): Promise<boolean> {
	const fromTurns = Object.fromEntries(
		classState.tables.map((table) => [table.tableId, proposalsTurnOf(table)]),
	);

	return guardedAct('all:newTurn', t('console.another_turn_all'), () =>
		classAllTablesTo({ mainId, step: 'talk', newTurn: true, fromTurns }),
	);
}

/**
 * One of the lesson's table-talk settings (IA 25), from the settings popover.
 * A setting, not a move of the room, so it works while the lesson is held too.
 */
export type TableSettingsPatch =
	| { allowOwnQuestions: boolean }
	| { speakSeconds: number }
	| { proposalsTurns: number };

export function setTableSetting(patch: TableSettingsPatch): Promise<boolean> {
	const field = Object.keys(patch)[0];

	return act(`tableSetting:${field}`, t('console.tables_group'), () =>
		setMainStatementSetting(consoleState.mainId, {
			statementSettings: patch,
		} as Partial<Statement>),
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
	field: 'liveResults',
	value: boolean,
): Promise<boolean> {
	const patch = { statementSettings: { voteDisplay: { [field]: value } } } as Partial<Statement>;

	return act(`voteDisplay:${field}`, t('console.vote_settings'), () =>
		setQuestionSetting(challengeId, patch),
	);
}

// >>> voteSummary BEGIN
/** The order of the proposals for every phone and the projector (IA 21). */
export function setVoteOrder(challengeId: string, order: ClassVoteOrder): Promise<boolean> {
	const patch = { statementSettings: { voteDisplay: { order } } } as Partial<Statement>;

	return act('voteDisplay:order', t('console.vote_order'), () =>
		setQuestionSetting(challengeId, patch),
	);
}
// >>> voteSummary END

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
