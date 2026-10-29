import type { DocumentSnapshot, Firestore, Query } from 'firebase-admin/firestore';
import {
	Collections,
	Role,
	checkSnapshot,
	flattenLines,
	isClassHome,
	snapshotFromLesson,
	CLASS_PLAN_TITLE_MAX_LENGTH,
} from '@freedi/shared-types';
import type { ClassPlan, Statement, StatementSubscription, User } from '@freedi/shared-types';
import { commitInBatches } from '../classroom/batchedWrites';
import type { BatchedWrite } from '../classroom/batchedWrites';
import {
	isHomeOf,
	readHomeAdmins,
	readSystemAdmins,
	revocableAdmins,
	teacherHomeTarget,
	writeHome,
} from '../classroom/classHome';
import type { HomeTarget } from '../classroom/classHome';
import { writeGameFromLesson } from '../classroom/gameWrites';
import { logError } from '../utils/errorHandling';

/**
 * Phase-2 migration (IA docs/ia/join-class-lesson-plan.md section 13): moves every
 * old top-level join-class lesson L under its teacher home `jcTeacher_{creatorId}`,
 * and gives it a lesson plan `classPlans/{L}` with one game `games/{L}`.
 *
 * Idempotent and resumable: every transform checks "already done" first, and L
 * itself is written LAST, so a run that stops midway re-selects L next time and
 * repeats the (no-op where done) steps. Live lessons are skipped and reported.
 * `sweep` re-runs the descendant/subscription steps on lessons already under a
 * home, to catch children a student wrote during the move with the old topParentId.
 *
 * Dry run unless `execute`. The CLI (scripts/moveClassLessonsHome.ts) wraps it in
 * backfillRunGuard: --execute to write, and --confirm-prod on production.
 */

/** A lesson touched in the last 3 hours at step > 0, live or paused, is left for a later run. */
export const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;
/** Lessons read per page. */
export const LESSON_PAGE_SIZE = 200;
/** Pause between lessons (every statement update fires the update triggers). */
export const PAUSE_BETWEEN_LESSONS_MS = 1000;
/** Firestore 'in' queries take at most this many values. */
const IN_QUERY_LIMIT = 30;
/** Longest parent chain walked when a descendant's parents must be rebuilt. */
const MAX_CHAIN_DEPTH = 20;
const STEP_INDEX_FIELD = 'statementSettings.lessonPlan.stepIndex';
const PLANS = 'classPlans';

/** An 'open' lesson (students may still write) touched within this window is left for later. */
export const OPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Writes per batch: small, so each burst of update triggers stays small. */
export const MIGRATION_BATCH_SIZE = 100;

/**
 * Why a lesson was not moved:
 * - live: live (any step, the waiting room included) touched < 3 h ago, or paused
 *   touched < 7 days ago;
 * - open: kept open for students, touched < 7 days ago;
 * - plan-foreign / game-foreign: `classPlans/{L}` (or its game) exists and belongs
 *   to someone else (a squat made before the rules refused it); fix by hand;
 * - home-foreign: `jcTeacher_{uid}` exists but is not that teacher's home (a squat);
 * - no-teacher: the lesson has no creator;
 * - error: anything else (see `error`).
 */
export type SkipReason =
	| 'live'
	| 'open'
	| 'no-teacher'
	| 'plan-foreign'
	| 'game-foreign'
	| 'home-foreign'
	| 'error';

export interface LessonMoveReport {
	lessonId: string;
	title: string;
	teacherUid: string;
	homeId: string;
	mode: 'move' | 'sweep';
	homeToCreate: boolean;
	descendants: number;
	descendantsToRewrite: number;
	subscriptions: number;
	subscriptionsToRewrite: number;
	planToCreate: boolean;
	gameToCreate: boolean;
	/** Why the game could not be made (the move still happens). */
	gameProblem?: string;
	skipped?: SkipReason;
	error?: string;
}

export interface MoveReport {
	execute: boolean;
	lessons: LessonMoveReport[];
	totals: {
		candidates: number;
		moved: number;
		swept: number;
		skippedLive: number;
		skippedOpen: number;
		skippedForeign: number;
		skippedOther: number;
		homesToCreate: number;
		descendantsToRewrite: number;
		subscriptionsToRewrite: number;
		plansToCreate: number;
		gamesToCreate: number;
	};
}

export interface MoveOptions {
	execute: boolean;
	/** Also re-run the descendant / subscription steps on lessons already under a home. */
	sweep?: boolean;
	/** Only this lesson (for a first careful run). */
	onlyLessonId?: string;
	now?: () => number;
	pauseMs?: number;
	pageSize?: number;
	/** Writes per batch (default MIGRATION_BATCH_SIZE). */
	batchSize?: number;
	sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Why a lesson must not move now, or null: live (any step, the waiting room
 * included) touched within LIVE_WINDOW_MS, or paused touched within
 * OPEN_WINDOW_MS -> 'live'; open touched within OPEN_WINDOW_MS -> 'open'.
 * Ended lessons, and stale ones, move.
 */
export function activeSkipReason(lesson: Statement, now: number): 'live' | 'open' | null {
	const plan = lesson.statementSettings?.lessonPlan;
	if (!plan) return null;
	const status = plan.status ?? 'live';
	const age = now - (lesson.lastChildUpdate ?? lesson.lastUpdate ?? 0);
	if (status === 'live' && age < LIVE_WINDOW_MS) return 'live';
	// A paused lesson is resumed later, like an open one: the long window.
	if (status === 'paused' && age < OPEN_WINDOW_MS) return 'live';
	if (status === 'open' && age < OPEN_WINDOW_MS) return 'open';

	return null;
}

/** A lesson being played right now (see activeSkipReason). */
export function isLiveLesson(lesson: Statement, now: number): boolean {
	return activeSkipReason(lesson, now) === 'live';
}

/** An old lesson still at the top, or (sweep) one already under a teacher/class home. */
export function lessonMode(lesson: Statement): 'move' | 'sweep' | null {
	if (!lesson.statementSettings?.lessonPlan || isClassHome(lesson)) return null;
	if (lesson.parentId === 'top') return 'move';

	return lesson.statementSettings?.classLesson ? 'sweep' : null;
}

/**
 * The new `parents` of a descendant of L under H. Already starting with H: unchanged.
 * Starting with L: H prepended. Missing or broken: rebuilt from the parent chain.
 */
export function movedParents(
	statement: Statement,
	lessonId: string,
	homeId: string,
	byId: ReadonlyMap<string, Statement>,
): string[] {
	const parents = Array.isArray(statement.parents) ? statement.parents : [];
	if (parents[0] === homeId && parents[1] === lessonId) return parents;
	if (parents[0] === lessonId) return [homeId, ...parents];
	const chain: string[] = [];
	let current = statement.parentId;
	for (let depth = 0; current && current !== lessonId && depth < MAX_CHAIN_DEPTH; depth++) {
		chain.unshift(current);
		current = byId.get(current)?.parentId ?? '';
	}

	return [homeId, lessonId, ...chain];
}

function sameList(a: readonly string[] | undefined, b: readonly string[]): boolean {
	return Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
}

async function loadTree(firestore: Firestore, lessonId: string): Promise<Statement[]> {
	const statements = firestore.collection(Collections.statements);
	const [byTop, byParents] = await Promise.all([
		statements.where('topParentId', '==', lessonId).get(),
		statements.where('parents', 'array-contains', lessonId).get(),
	]);
	const all = new Map<string, Statement>();
	for (const snap of [...byTop.docs, ...byParents.docs]) {
		if (snap.id !== lessonId) all.set(snap.id, snap.data() as Statement);
	}

	return [...all.values()];
}

async function loadSubscriptions(
	firestore: Firestore,
	lessonId: string,
	questionIds: readonly string[],
): Promise<Map<string, { ref: DocumentSnapshot['ref']; data: StatementSubscription }>> {
	const subs = firestore.collection(Collections.statementsSubscribe);
	const queries: Query[] = [
		subs.where('topParentId', '==', lessonId),
		subs.where('statementId', '==', lessonId),
	];
	for (let i = 0; i < questionIds.length; i += IN_QUERY_LIMIT) {
		queries.push(subs.where('statementId', 'in', questionIds.slice(i, i + IN_QUERY_LIMIT)));
	}
	const snaps = await Promise.all(queries.map((q) => q.get()));
	const found = new Map<string, { ref: DocumentSnapshot['ref']; data: StatementSubscription }>();
	for (const snap of snaps.flatMap((s) => s.docs)) {
		found.set(snap.ref.path, { ref: snap.ref, data: snap.data() as StatementSubscription });
	}

	return found;
}

interface Placement {
	parentId: string;
	topParentId: string;
	parents: string[];
}

function descendantWrites(
	firestore: Firestore,
	tree: readonly Statement[],
	lessonId: string,
	homeId: string,
): { writes: BatchedWrite[]; placements: Map<string, Placement> } {
	const byId = new Map(tree.map((s) => [s.statementId, s]));
	const statements = firestore.collection(Collections.statements);
	const writes: BatchedWrite[] = [];
	const placements = new Map<string, Placement>();
	for (const s of tree) {
		const parents = movedParents(s, lessonId, homeId, byId);
		placements.set(s.statementId, { parentId: s.parentId, topParentId: homeId, parents });
		const data: Record<string, unknown> = {};
		if (s.topParentId !== homeId) data.topParentId = homeId;
		if (!sameList(s.parents, parents)) data.parents = parents;
		if (Object.keys(data).length > 0) {
			writes.push({ kind: 'update', ref: statements.doc(s.statementId), data });
		}
	}

	return { writes, placements };
}

/**
 * Subscription rewrites. `topParentId` moves to the home everywhere. On L's OWN
 * subscriptions, `parentId` and the embedded `statement` are left as they are
 * ('top'): the userFeed trigger (fn_subscriptionLifecycle -> feedRelevantChange /
 * isTopLevelSubscription) would otherwise see L stop being top-level and delete
 * every member's userFeed entry for L, against IA 13.7 ("old userFeed entries for
 * L are left alone; they still open L"). Those two fields are documented as
 * set-once at creation anyway. Descendants' subscriptions get their embedded
 * topParentId / parents moved (they are never top-level, so no feed change).
 */
function subscriptionWrites(
	subs: ReadonlyMap<string, { ref: DocumentSnapshot['ref']; data: StatementSubscription }>,
	placements: ReadonlyMap<string, Placement>,
	homeId: string,
	lessonId: string,
): BatchedWrite[] {
	const writes: BatchedWrite[] = [];
	for (const { ref, data: sub } of subs.values()) {
		const place = sub.statementId === lessonId ? undefined : placements.get(sub.statementId);
		const data: Record<string, unknown> = {};
		if (sub.topParentId !== homeId) data.topParentId = homeId;
		const embedded = sub.statement as Partial<Statement> | undefined;
		if (place && embedded && typeof embedded === 'object') {
			if (embedded.topParentId !== homeId) data['statement.topParentId'] = homeId;
			if (!sameList(embedded.parents, place.parents)) data['statement.parents'] = place.parents;
		}
		if (Object.keys(data).length > 0) writes.push({ kind: 'update', ref, data });
	}

	return writes;
}

function teacherOf(lesson: Statement): User | null {
	const uid = lesson.creatorId || lesson.creator?.uid;
	if (!uid) return null;
	const displayName = lesson.creator?.uid === uid ? (lesson.creator.displayName ?? '') : '';

	return { uid, displayName, isAnonymous: false };
}

async function ensureHome(
	firestore: Firestore,
	target: HomeTarget,
	teacher: User,
	now: number,
): Promise<void> {
	const homeRef = firestore.collection(Collections.statements).doc(target.homeId);
	await firestore.runTransaction(async (tx) => {
		const home = await tx.get(homeRef);
		const admins = await readHomeAdmins(firestore, tx, target);
		const systemAdmins = await readSystemAdmins(firestore, tx, revocableAdmins(target, admins));
		if (home.exists && admins.get(teacher.uid) === Role.admin && admins.size === 1) return;
		writeHome({
			firestore,
			tx,
			target,
			existing: home.exists ? (home.data() as Statement) : undefined,
			existingAdmins: admins,
			systemAdmins,
			creator: teacher,
			users: [teacher],
			now,
		});
	});
}

async function ensurePlanAndGame(
	firestore: Firestore,
	lesson: Statement,
	teacher: User,
	tree: readonly Statement[],
	now: number,
	report: LessonMoveReport,
	execute: boolean,
): Promise<void> {
	const lessonId = lesson.statementId;
	const planRef = firestore.collection(PLANS).doc(lessonId);
	const [planSnap, gameSnap] = await Promise.all([
		planRef.get(),
		planRef.collection('games').doc(lessonId).get(),
	]);
	report.planToCreate = !planSnap.exists;
	report.gameToCreate = !gameSnap.exists;
	if (planSnap.exists && (planSnap.data() as ClassPlan).ownerUid !== teacher.uid) {
		throw new ForeignDoc('plan-foreign');
	}
	if (gameSnap.exists && (gameSnap.data() as { ownerUid?: string }).ownerUid !== teacher.uid) {
		throw new ForeignDoc('game-foreign');
	}
	const children = tree.filter((s) => s.parentId === lessonId);
	const checked = checkSnapshot(snapshotFromLesson(lesson, children));
	if (!checked.ok) {
		report.gameProblem = checked.problem;
		report.gameToCreate = false;
	}
	const title =
		flattenLines(lesson.statement ?? '').slice(0, CLASS_PLAN_TITLE_MAX_LENGTH) || lessonId;
	const plan: ClassPlan = {
		planId: lessonId,
		title,
		ownerUid: teacher.uid,
		createdAt: now,
		lastUpdate: now,
	};
	if (!execute) return;
	if (!checked.ok) {
		if (!planSnap.exists) await planRef.create(plan);

		return;
	}
	if (!gameSnap.exists) {
		await writeGameFromLesson(firestore, {
			planId: lessonId,
			gameId: lessonId,
			ownerUid: teacher.uid,
			title,
			snapshot: checked.snapshot,
			sourceMainId: lessonId,
			planIfMissing: plan,
			now,
		});
	}
}

/** A doc at an id the migration needs, owned by someone else: reported, never overwritten. */
class ForeignDoc extends Error {
	constructor(readonly reason: 'plan-foreign' | 'game-foreign' | 'home-foreign') {
		super(reason);
	}
}

/** Moves (or, in sweep mode, re-checks) one lesson. Never throws; errors land in the report. */
export async function moveLesson(
	firestore: Firestore,
	lesson: Statement,
	options: MoveOptions,
): Promise<LessonMoveReport> {
	const now = (options.now ?? Date.now)();
	const lessonId = lesson.statementId;
	const mode = lessonMode(lesson) ?? 'move';
	const teacher = teacherOf(lesson);
	const homeId =
		mode === 'sweep' ? lesson.parentId : teacher ? teacherHomeTarget(teacher).homeId : '';
	const report: LessonMoveReport = {
		lessonId,
		title: flattenLines(lesson.statement ?? ''),
		teacherUid: teacher?.uid ?? '',
		homeId,
		mode,
		homeToCreate: false,
		descendants: 0,
		descendantsToRewrite: 0,
		subscriptions: 0,
		subscriptionsToRewrite: 0,
		planToCreate: false,
		gameToCreate: false,
	};
	if (!teacher) return { ...report, skipped: 'no-teacher' };
	const active = mode === 'move' ? activeSkipReason(lesson, now) : null;
	if (active) return { ...report, skipped: active };

	try {
		const tree = await loadTree(firestore, lessonId);
		if (mode === 'move') {
			// Every check that can refuse the move runs before the first write.
			const target = teacherHomeTarget(teacher);
			const home = await firestore.collection(Collections.statements).doc(target.homeId).get();
			report.homeToCreate = !home.exists;
			if (home.exists && !isHomeOf(home.data() as Statement, target)) {
				throw new ForeignDoc('home-foreign');
			}
			await ensurePlanAndGame(firestore, lesson, teacher, tree, now, report, false);
			if (options.execute) await ensureHome(firestore, target, teacher, now);
		}

		report.descendants = tree.length;
		const { writes, placements } = descendantWrites(firestore, tree, lessonId, homeId);
		placements.set(lessonId, { parentId: homeId, topParentId: homeId, parents: [homeId] });
		const questionIds = tree
			.filter((s) => s.statementType === 'question')
			.map((s) => s.statementId);
		const subs = await loadSubscriptions(firestore, lessonId, questionIds);
		const subWrites = subscriptionWrites(subs, placements, homeId, lessonId);
		report.descendantsToRewrite = writes.length;
		report.subscriptions = subs.size;
		report.subscriptionsToRewrite = subWrites.length;

		if (!options.execute) return report;
		if (mode === 'move') {
			await ensurePlanAndGame(firestore, lesson, teacher, tree, now, report, true);
		}

		await commitInBatches(
			firestore,
			[...writes, ...subWrites],
			options.batchSize ?? MIGRATION_BATCH_SIZE,
		);
		if (mode === 'move') {
			// L last: a run that stops before this line selects L again next time.
			await firestore
				.collection(Collections.statements)
				.doc(lessonId)
				.update({
					parentId: homeId,
					topParentId: homeId,
					parents: [homeId],
					...(lesson.statementSettings?.classLesson
						? {}
						: {
								'statementSettings.classLesson': {
									planId: lessonId,
									gameId: lessonId,
									classId: null,
									className: '',
								},
							}),
				});
		}

		return report;
	} catch (error) {
		if (error instanceof ForeignDoc) return { ...report, skipped: error.reason };
		logError(error, {
			operation: 'migrations.moveClassLessonsHome',
			statementId: lessonId,
			userId: teacher.uid,
			metadata: { homeId, mode, execute: options.execute },
		});

		return {
			...report,
			skipped: 'error',
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

interface LessonPage {
	lessons: Statement[];
	last: DocumentSnapshot | undefined;
	done: boolean;
}

/** One page of lessons (every statement with a lesson plan), after `after`. */
async function lessonPage(
	firestore: Firestore,
	pageSize: number,
	after: DocumentSnapshot | undefined,
): Promise<LessonPage> {
	let query = firestore
		.collection(Collections.statements)
		.where(STEP_INDEX_FIELD, '>=', 0)
		.orderBy(STEP_INDEX_FIELD)
		.limit(pageSize);
	if (after) query = query.startAfter(after);
	const page = await query.get();

	return {
		lessons: page.docs.map((d) => d.data() as Statement),
		last: page.docs[page.docs.length - 1],
		done: page.size < pageSize,
	};
}

function emptyTotals(): MoveReport['totals'] {
	return {
		candidates: 0,
		moved: 0,
		swept: 0,
		skippedLive: 0,
		skippedOpen: 0,
		skippedForeign: 0,
		skippedOther: 0,
		homesToCreate: 0,
		descendantsToRewrite: 0,
		subscriptionsToRewrite: 0,
		plansToCreate: 0,
		gamesToCreate: 0,
	};
}

/** Runs the migration over every old lesson (or `onlyLessonId`). */
export async function moveClassLessonsHome(
	firestore: Firestore,
	options: MoveOptions,
): Promise<MoveReport> {
	const sleep = options.sleep ?? realSleep;
	const pause = options.pauseMs ?? PAUSE_BETWEEN_LESSONS_MS;
	const report: MoveReport = { execute: options.execute, lessons: [], totals: emptyTotals() };
	const homesSeen = new Set<string>();
	const pageSize = options.pageSize ?? LESSON_PAGE_SIZE;
	let after: DocumentSnapshot | undefined;
	for (let done = false; !done; ) {
		const page = await lessonPage(firestore, pageSize, after);
		after = page.last;
		done = page.done || !page.last;
		for (const lesson of page.lessons) {
			if (options.onlyLessonId && lesson.statementId !== options.onlyLessonId) continue;
			const mode = lessonMode(lesson);
			if (!mode || (mode === 'sweep' && !options.sweep)) continue;
			const one = await moveLesson(firestore, lesson, options);
			report.lessons.push(one);
			const t = report.totals;
			t.candidates++;
			if (one.skipped === 'live') t.skippedLive++;
			else if (one.skipped === 'open') t.skippedOpen++;
			else if (one.skipped?.endsWith('-foreign')) t.skippedForeign++;
			else if (one.skipped) t.skippedOther++;
			else if (one.mode === 'sweep') t.swept++;
			else t.moved++;
			if (one.homeToCreate && !homesSeen.has(one.homeId)) {
				homesSeen.add(one.homeId);
				t.homesToCreate++;
			}
			t.descendantsToRewrite += one.descendantsToRewrite;
			t.subscriptionsToRewrite += one.subscriptionsToRewrite;
			if (one.planToCreate) t.plansToCreate++;
			if (one.gameToCreate) t.gamesToCreate++;
			if (options.execute && !one.skipped && pause > 0) await sleep(pause);
		}
	}

	return report;
}

/** Human-readable report for the CLI. */
export function formatMoveReport(report: MoveReport): string {
	const lines = report.lessons.map((l) => {
		const head = `- ${l.lessonId} "${l.title}" teacher=${l.teacherUid || '?'} home=${l.homeId || '?'} [${l.mode}]`;
		if (l.skipped) return `${head} SKIPPED: ${l.skipped}${l.error ? ` (${l.error})` : ''}`;

		return (
			`${head}${l.homeToCreate ? ' (home to create)' : ''}` +
			` descendants=${l.descendants} (rewrite ${l.descendantsToRewrite})` +
			` subscriptions=${l.subscriptions} (rewrite ${l.subscriptionsToRewrite})` +
			`${l.planToCreate ? ' +plan' : ''}${l.gameToCreate ? ' +game' : ''}` +
			`${l.gameProblem ? ` game-problem=${l.gameProblem}` : ''}`
		);
	});
	const t = report.totals;

	return [
		'',
		...lines,
		'',
		`Totals: candidates=${t.candidates} ${report.execute ? 'moved' : 'toMove'}=${t.moved} swept=${t.swept} skippedLive=${t.skippedLive}` +
			` skippedOpen=${t.skippedOpen} skippedForeign=${t.skippedForeign}` +
			` skippedOther=${t.skippedOther} homesToCreate=${t.homesToCreate}` +
			` descendantsToRewrite=${t.descendantsToRewrite} subscriptionsToRewrite=${t.subscriptionsToRewrite}` +
			` plansToCreate=${t.plansToCreate} gamesToCreate=${t.gamesToCreate}`,
	].join('\n');
}
