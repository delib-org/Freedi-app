import m from 'mithril';
import type { ClassSide, ClassTable, StatementSubscription } from '@freedi/shared-types';
import type { Unsubscribe } from '../firebase';
import { ensureMemberSubscription } from './studentWrites';
import { initServerClock } from './serverClock';
import { getMainStatement, getSubQuestions } from '../store';
import { getChallengeQuestion, lessonStepOf } from '../lessonCore';
import { startStudentNotices } from './studentNotices';
import type { NoticeSnapshot } from './noticeLogic';
import {
	listenMySide,
	listenMySubscription,
	listenRoster,
	listenTable,
	listenTables,
	readMySubscriptionFromServer,
} from './listeners';
import type { RosterSubscription } from './rosterPrivacy';
import { OptimisticOverlay } from './optimisticOverlay';
import type { TableChange } from './tableOptimism';
import { captureException } from '../sentry';

/**
 * Module-level classroom state that views read (Join's store pattern: plain
 * module state + `m.redraw()` when a listener delivers). Views never hold their
 * own copies; they call `watchClass` in oninit and the returned stop in onremove.
 *
 *   student: mySubscription (tableId, sidePickedAt), mySide (their own private
 *            side / camp / decisionSupport) and the student's own `table`
 *            (re-targeted when `tableId` changes)
 *   teacher: `tables` (all, sorted by n) and `roster` (all subscriptions, never
 *            anyone's side: see rosterPrivacy.ts)
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
	/** The signed-in student's own private side doc (null until they pick or rate). */
	mySide: ClassSide | null;
	/** Every subscription of the workspace (teacher / projector), without any side. */
	roster: RosterSubscription[];
}

export const classState: ClassState = {
	mainId: null,
	table: null,
	tables: [],
	mySubscription: null,
	mySubscriptionLoaded: false,
	mySide: null,
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
	classState.mySide = null;
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

/** How long a table denial waits for the student's subscription to show they were moved. */
export const MOVE_CONFIRM_WAIT_MS = 4_000;

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
 * student: ensures the member subscription exists, then my subscription, my side + my table.
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

	// A student who is moved loses the right to read the old table, often before their own
	// subscription (with the new tableId) reaches the server or this phone. So a permission-denied
	// on a table is confirmed first: the server's copy of the subscription, then the next
	// subscription snapshot within MOVE_CONFIRM_WAIT_MS. If the subscription no longer names that
	// table the denial is expected and the stream just stops. Otherwise it is a real fault and
	// takes the normal error path (log, onError, retries).
	const moveWaiters: Array<() => void> = [];

	const confirmMoved = (failedTableId: string) => async (): Promise<boolean> => {
		const moved = (): boolean => stopped || watchedTableId !== failedTableId;
		if (moved()) return true;
		const sub = await readMySubscriptionFromServer(mainId);
		if (sub?.tableId !== failedTableId || moved()) return true;
		await new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, MOVE_CONFIRM_WAIT_MS);
			moveWaiters.push(() => {
				clearTimeout(timer);
				resolve();
			});
		});

		return moved();
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
			listenMySide(
				mainId,
				(side) => {
					classState.mySide = side;
					m.redraw();
				},
				onError,
			),
			listenMySubscription(
				mainId,
				(sub) => {
					classState.mySubscription = sub;
					classState.mySubscriptionLoaded = true;
					const tableId = sub?.tableId;
					if (tableId !== watchedTableId) {
						watchedTableId = tableId;
						for (const wake of moveWaiters.splice(0)) wake();
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
								onError,
								confirmMoved(tableId),
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
