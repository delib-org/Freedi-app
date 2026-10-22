import type {
	ClassTableAction,
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
	classSetLessonStatus,
	classTableStep,
} from '@/lib/classroom/api';
import type { DropTarget } from '@/lib/classroom/dragReducer';
import { Collections } from '@freedi/shared-types';
import { db, doc, updateDoc } from '@/lib/firebase';
import { setLessonStep } from '@/lib/lesson';
import { isLessonStanding, lessonStatusOfMain } from '@/lib/lessonCore';
import { getMainStatement, setOptionFlag, setQuestionSetting } from '@/lib/store';
import { t } from '@/lib/i18n';
import { act, consoleState } from './consoleState';

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
	return guardedAct(`step:${index}`, t('console.act_step'), () => setLessonStep(mainId, index));
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
	return guardedAct('freeze', t('console.freeze'), () => classFreezeBallot({ mainId }));
}

export function closeBallot(mainId: string): Promise<boolean> {
	return guardedAct('close', t('console.close_vote'), () => classCloseBallot({ mainId }));
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

export function setHidden(optionId: string, hidden: boolean): Promise<boolean> {
	return guardedAct(`hide:${optionId}`, t(hidden ? 'console.hide' : 'console.restore'), () =>
		setOptionFlag(optionId, 'hide', hidden),
	);
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
