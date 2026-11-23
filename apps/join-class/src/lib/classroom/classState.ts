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
import { OptimisticOverlay } from './optimisticOverlay';
import type { TableChange } from './tableOptimism';
import { captureException } from '../sentry';

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
	/** The listener on `mySubscription` has answered once (null then means "no such doc"). */
	mySubscriptionLoaded: boolean;
	/** Every subscription of the workspace (teacher / projector). */
	roster: StatementSubscription[];
}

export const classState: ClassState = {
	mainId: null,
	table: null,
	tables: [],
	mySubscription: null,
	mySubscriptionLoaded: false,
	roster: [],
};

/**
 * What the server last sent for the tables, apart from `classState`, which shows
 * it with the pending optimistic changes laid over it (see optimisticOverlay.ts).
 * The student's own table is a list of one so the same changes apply to it.
 */
const server: { tables: ClassTable[]; table: ClassTable | null } = { tables: [], table: null };

function showTables(): void {
	classState.tables = tableOverlay.view(server.tables);
	classState.table = server.table ? (tableOverlay.view([server.table])[0] ?? null) : null;
}

const tableOverlay = new OptimisticOverlay<ClassTable[]>(
	() => {
		showTables();
		m.redraw();
	},
	(error) => captureException(error, { operation: 'classState.optimisticTables' }),
);

/**
 * Run a table call and show its expected result at once. If the call fails the
 * screen goes back to the server's data and the error is thrown to the caller.
 * A `null` change just runs the call.
 */
export function trackTableChange<R>(
	change: TableChange | null,
	call: () => Promise<R>,
): Promise<R> {
	// What the server shows now: a snapshot that merely repeats it cannot confirm the change.
	const baseline = server.tables.length > 0 ? server.tables : server.table ? [server.table] : [];

	return change ? tableOverlay.track(change, call, baseline) : call();
}

function setServerTables(tables: ClassTable[]): void {
	server.tables = tables;
	tableOverlay.reconcile(tables);
	showTables();
}

function setServerTable(table: ClassTable | null): void {
	server.table = table;
	if (table) tableOverlay.reconcile([table]);
	showTables();
}

export function resetClassState(mainId: string | null = null): void {
	tableOverlay.clear();
	server.tables = [];
	server.table = null;
	classState.mainId = mainId;
	classState.table = null;
	classState.tables = [];
	classState.mySubscription = null;
	classState.mySubscriptionLoaded = false;
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

/** Firestore's refusal to read: `code` is "permission-denied". */
export function isPermissionDenied(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'permission-denied'
	);
}

export type ClassWatchRole = 'student' | 'teacher';

export interface ClassWatchOptions {
	/**
	 * Student role: join the lesson as soon as the screen opens (the ordinary join). False in a
	 * connected lesson, where everyone comes in through the name gate (`classArriveByName`).
	 */
	autoJoin?: boolean;
}

/**
 * Start the listeners for a role and return one stop function.
 * student: ensures the member subscription exists, then my subscription + my table.
 * teacher: all tables + the roster.
 */
export function watchClass(
	mainId: string,
	role: ClassWatchRole,
	options: ClassWatchOptions = {},
): () => void {
	resetClassState(mainId);
	void initServerClock();
	const stops: Unsubscribe[] = [];
	let tableStop: Unsubscribe | null = null;
	let watchedTableId: string | undefined;
	let stopped = false;

	const onError = (error: Error): void => {
		console.error('[Classroom] listener error:', error);
	};

	// A student who is moved loses the right to read the old table a moment before their own
	// subscription says so: that denial is the move arriving, not a fault (the subscription
	// listener starts the new table's listener right after).
	const onTableError = (error: Error): void => {
		if (isPermissionDenied(error)) {
			console.info('[Classroom] table closed to me (moved); waiting for the new table');

			return;
		}
		onError(error);
	};

	if (role === 'teacher') {
		stops.push(
			listenTables(
				mainId,
				(tables) => {
					setServerTables(tables);
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
		if (options.autoJoin !== false) void ensureMemberSubscription(mainId).catch(() => undefined);
		stops.push(
			startStudentNotices(readNoticeSnapshot),
			listenMySubscription(
				mainId,
				(sub) => {
					classState.mySubscription = sub;
					classState.mySubscriptionLoaded = true;
					const tableId = sub?.tableId;
					if (tableId !== watchedTableId) {
						watchedTableId = tableId;
						tableStop?.();
						tableStop = null;
						setServerTable(null);
						if (tableId && !stopped) {
							tableStop = listenTable(
								tableId,
								(table) => {
									setServerTable(table);
									m.redraw();
								},
								onTableError,
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
