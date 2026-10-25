import m from 'mithril';
import type { ClassTable, StatementSubscription } from '@freedi/shared-types';
import type { Unsubscribe } from '../firebase';
import { ensureMemberSubscription } from './studentWrites';
import { initServerClock } from './serverClock';
import { getMainStatement, getSubQuestions } from '../store';
import { getChallengeQuestion, lessonStepOf } from '../lessonCore';
import { startStudentNotices } from './studentNotices';
import type { NoticeSnapshot } from './noticeLogic';
import { listenMySubscription, listenRoster, listenTable, listenTables } from './listeners';

/**
 * Module-level classroom state that views read (Join's store pattern: plain
 * module state + `m.redraw()` when a listener delivers). Views never hold their
 * own copies; they call `watchClass` in oninit and the returned stop in onremove.
 *
 *   student: mySubscription (side / camp / decisionSupport / tableId) and the
 *            student's own `table` (re-targeted when `tableId` changes)
 *   teacher: `tables` (all, sorted by n) and `roster` (all subscriptions)
 */

export interface ClassState {
	mainId: string | null;
	/** The student's own table doc (null = not seated / not created yet). */
	table: ClassTable | null;
	/** Every table of the workspace (teacher / projector). */
	tables: ClassTable[];
	/** The signed-in student's workspace subscription. */
	mySubscription: StatementSubscription | null;
	/** Every subscription of the workspace (teacher / projector). */
	roster: StatementSubscription[];
}

export const classState: ClassState = {
	mainId: null,
	table: null,
	tables: [],
	mySubscription: null,
	roster: [],
};

export function resetClassState(mainId: string | null = null): void {
	classState.mainId = mainId;
	classState.table = null;
	classState.tables = [];
	classState.mySubscription = null;
	classState.roster = [];
}

/** What the phone sees now, for its one-time lines (IA 18.2); null before the lesson loads. */
function readNoticeSnapshot(): NoticeSnapshot | null {
	const main = getMainStatement();
	if (!main) return null;
	const step = lessonStepOf(main.statementSettings?.lessonPlan);
	const table = classState.table;
	const ballot = getChallengeQuestion(getSubQuestions())?.statementSettings?.ballot;

	return {
		stepIndex: step.index,
		stepKey: step.key,
		tableTurn: table?.turn ?? null,
		tableStep: table?.step ?? null,
		tableAsked: table?.askedUids?.length ?? 0,
		tableUsed: table?.usedQuestionIds.length ?? 0,
		ballotFrozenAt: ballot?.frozenAt ?? null,
		ballotClosedAt: ballot?.closedAt ?? null,
	};
}

export type ClassWatchRole = 'student' | 'teacher';

/**
 * Start the listeners for a role and return one stop function.
 * student: ensures the member subscription exists, then my subscription + my table.
 * teacher: all tables + the roster.
 */
export function watchClass(mainId: string, role: ClassWatchRole): () => void {
	resetClassState(mainId);
	void initServerClock();
	const stops: Unsubscribe[] = [];
	let tableStop: Unsubscribe | null = null;
	let watchedTableId: string | undefined;
	let stopped = false;

	const onError = (error: Error): void => {
		console.error('[Classroom] listener error:', error);
	};

	if (role === 'teacher') {
		stops.push(
			listenTables(
				mainId,
				(tables) => {
					classState.tables = tables;
					m.redraw();
				},
				onError,
			),
			listenRoster(
				mainId,
				(subs) => {
					classState.roster = subs;
					m.redraw();
				},
				onError,
			),
		);
	} else {
		void ensureMemberSubscription(mainId).catch(() => undefined);
		stops.push(
			startStudentNotices(readNoticeSnapshot),
			listenMySubscription(
				mainId,
				(sub) => {
					classState.mySubscription = sub;
					const tableId = sub?.tableId;
					if (tableId !== watchedTableId) {
						watchedTableId = tableId;
						tableStop?.();
						tableStop = null;
						classState.table = null;
						if (tableId && !stopped) {
							tableStop = listenTable(
								tableId,
								(table) => {
									classState.table = table;
									m.redraw();
								},
								onError,
							);
						}
					}
					m.redraw();
				},
				onError,
			),
		);
	}

	return () => {
		stopped = true;
		for (const stop of stops) stop();
		tableStop?.();
		resetClassState(null);
	};
}
