import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, StatementType, type Statement } from '@freedi/shared-types';
import {
	clusterVoteSourceIds,
	computeClusterEvaluationFromRawEvals,
	fetchEvaluationsForIds,
	recomputeClusterEvaluation,
} from './aggregation';
import { logError } from '../utils/errorHandling';

/**
 * Nightly reconciliation of cluster scores (synth, theme, claim clusters).
 *
 * Visits the questions whose `lastChildUpdate` is inside the last
 * RECONCILE_ACTIVE_WINDOW_MS AND newer than the start of the last completed
 * pass (votes bump the question's lastChildUpdate), and recomputes each of
 * their visible clusters with the one cluster vote rule
 * (`clusterVoteRule.ts`). A question with no activity since the last pass
 * costs nothing: its clusters were checked then and nothing has changed.
 *
 * Questions come from the existing (statementType, lastChildUpdate desc)
 * index; clusters per question from an equality-only query. No full scan
 * of cluster docs, no new composite index.
 *
 * Bounded: the deadline is checked before every cluster; the cursor (last
 * question / last cluster handled) is saved every RECONCILE_SAVE_EVERY
 * clusters and when the run stops, so the next tick resumes right after the
 * last cluster actually handled. A finished pass is not restarted until
 * RECONCILE_MIN_PASS_INTERVAL_MS has passed.
 *
 * Writes a cluster only when its stored score drifted from the recomputed
 * one, so a healthy cluster costs reads only and fires no triggers.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const RECONCILE_ACTIVE_WINDOW_DAYS = 30;
export const RECONCILE_ACTIVE_WINDOW_MS = RECONCILE_ACTIVE_WINDOW_DAYS * DAY_MS;
/** Questions per query page. */
export const RECONCILE_PAGE_SIZE = 50;
/** Save the cursor after this many handled clusters. */
export const RECONCILE_SAVE_EVERY = 10;
/** Leaves headroom under the 540 s function timeout for one cluster. */
export const RECONCILE_TIME_BUDGET_MS = 420 * 1000;
export const RECONCILE_MIN_PASS_INTERVAL_MS = 20 * HOUR_MS;
/** Score differences smaller than this are rounding, not drift. */
export const RECONCILE_DRIFT_EPSILON = 1e-6;
export const RECONCILE_STATE_COLLECTION = '_maintenance';
export const RECONCILE_STATE_DOC = 'nightlyClusterReconcile';

export interface ReconcileCursor {
	/** The question being (or last) handled, as ordered by the query. */
	questionId: string;
	lastChildUpdate: number;
	/** Last cluster handled inside that question; null = question finished. */
	clusterId: string | null;
}

export interface ReconcileState {
	/** Null = no pass in progress. */
	cursor: ReconcileCursor | null;
	passStartedAt: number;
	lastPassCompletedAt: number;
	/** Start of the last completed pass: activity after it is re-checked. */
	lastCompletedPassStartedAt: number;
}

export interface ReconcileRunResult {
	status: 'idle' | 'partial' | 'completed';
	questions: number;
	checked: number;
	recomputed: number;
	failed: number;
	cursor: ReconcileCursor | null;
}

export interface ReconcileOptions {
	now?: () => number;
	pageSize?: number;
	timeBudgetMs?: number;
}

const EMPTY_STATE: ReconcileState = {
	cursor: null,
	passStartedAt: 0,
	lastPassCompletedAt: 0,
	lastCompletedPassStartedAt: 0,
};

/** Should this tick do nothing, continue a pass, or start a new one? */
export function planTick(state: ReconcileState, now: number): 'idle' | 'continue' | 'start' {
	if (state.cursor !== null) return 'continue';
	if (now - state.lastPassCompletedAt < RECONCILE_MIN_PASS_INTERVAL_MS) return 'idle';

	return 'start';
}

/** Questions with lastChildUpdate >= this are visited in the pass. */
export function activitySince(state: ReconcileState): number {
	return Math.max(
		state.passStartedAt - RECONCILE_ACTIVE_WINDOW_MS,
		state.lastCompletedPassStartedAt,
	);
}

/** Visible clusters of one question, in id order, after the cursor's cluster. */
export function clustersToHandle(
	clusters: Statement[],
	afterClusterId: string | null,
): Statement[] {
	return clusters
		.filter((c) => c.isCluster === true && c.hide !== true)
		.sort((a, b) => (a.statementId < b.statementId ? -1 : 1))
		.filter((c) => afterClusterId === null || c.statementId > afterClusterId);
}

function nearlyEqual(a: number | undefined, b: number): boolean {
	return Math.abs((a ?? 0) - b) <= RECONCILE_DRIFT_EPSILON;
}

/** True when the stored score differs from what the rule gives today. */
async function hasDrifted(cluster: Statement): Promise<boolean> {
	const evals = await fetchEvaluationsForIds(clusterVoteSourceIds(cluster.statementId, cluster));
	const { evaluation } = computeClusterEvaluationFromRawEvals(evals, {
		clusterStatementId: cluster.statementId,
		absorbedClusterIds: cluster.absorbedClusterIds,
	});
	const stored = cluster.evaluation;

	return !(
		stored &&
		stored.numberOfEvaluators === evaluation.numberOfEvaluators &&
		nearlyEqual(stored.sumEvaluations, evaluation.sumEvaluations) &&
		nearlyEqual(stored.agreement, evaluation.agreement) &&
		nearlyEqual(cluster.consensus, evaluation.agreement)
	);
}

async function loadState(db: Firestore): Promise<ReconcileState> {
	const snap = await db.collection(RECONCILE_STATE_COLLECTION).doc(RECONCILE_STATE_DOC).get();

	return snap.exists
		? { ...EMPTY_STATE, ...(snap.data() as Partial<ReconcileState>) }
		: EMPTY_STATE;
}

async function saveState(db: Firestore, state: ReconcileState): Promise<void> {
	await db.collection(RECONCILE_STATE_COLLECTION).doc(RECONCILE_STATE_DOC).set(state);
}

async function fetchQuestionPage(
	db: Firestore,
	since: number,
	cursor: ReconcileCursor | null,
	pageSize: number,
): Promise<Statement[]> {
	let query = db
		.collection(Collections.statements)
		.where('statementType', '==', StatementType.question)
		.where('lastChildUpdate', '>=', since)
		.orderBy('lastChildUpdate', 'desc')
		.orderBy('__name__', 'desc')
		.limit(pageSize);
	if (cursor) query = query.startAfter(cursor.lastChildUpdate, cursor.questionId);
	const snap = await query.get();

	return snap.docs.map((d) => ({ ...(d.data() as Statement), statementId: d.id }));
}

async function fetchClusters(db: Firestore, questionId: string): Promise<Statement[]> {
	const snap = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionId)
		.where('isCluster', '==', true)
		.get();

	return snap.docs.map((d) => d.data() as Statement);
}

async function reconcileCluster(cluster: Statement, result: ReconcileRunResult): Promise<void> {
	result.checked += 1;
	try {
		if (await hasDrifted(cluster)) {
			await recomputeClusterEvaluation(cluster.statementId);
			result.recomputed += 1;
		}
	} catch (error) {
		result.failed += 1;
		logError(error, {
			operation: 'condensation.runClusterReconcile.recompute',
			statementId: cluster.statementId,
			metadata: { parentId: cluster.parentId },
		});
	}
}

export async function runClusterReconcile(
	db: Firestore,
	options: ReconcileOptions = {},
): Promise<ReconcileRunResult> {
	const now = options.now ?? Date.now;
	const pageSize = options.pageSize ?? RECONCILE_PAGE_SIZE;
	const deadline = now() + (options.timeBudgetMs ?? RECONCILE_TIME_BUDGET_MS);
	const result: ReconcileRunResult = {
		status: 'idle',
		questions: 0,
		checked: 0,
		recomputed: 0,
		failed: 0,
		cursor: null,
	};

	let state = await loadState(db);
	const plan = planTick(state, now());
	if (plan === 'idle') return result;
	if (plan === 'start') state = { ...state, cursor: null, passStartedAt: now() };
	const since = activitySince(state);
	let cursor = state.cursor;
	let unsaved = 0;

	const stop = async (): Promise<ReconcileRunResult> => {
		await saveState(db, { ...state, cursor });
		result.status = 'partial';
		result.cursor = cursor;
		logger.info('condensation.runClusterReconcile.partial', { ...result });

		return result;
	};

	/** Handles one question's clusters; false when the deadline stopped it. */
	const handleQuestion = async (questionId: string, lastChildUpdate: number): Promise<boolean> => {
		const resumeAfter = cursor?.questionId === questionId ? cursor.clusterId : null;
		const clusters = clustersToHandle(await fetchClusters(db, questionId), resumeAfter);
		result.questions += 1;
		for (const cluster of clusters) {
			if (now() >= deadline) return false;
			await reconcileCluster(cluster, result);
			cursor = { questionId, lastChildUpdate, clusterId: cluster.statementId };
			unsaved += 1;
			if (unsaved >= RECONCILE_SAVE_EVERY) {
				await saveState(db, { ...state, cursor });
				unsaved = 0;
			}
		}
		cursor = { questionId, lastChildUpdate, clusterId: null };

		return true;
	};

	// Finish the question the previous run stopped inside.
	if (cursor && cursor.clusterId !== null) {
		if (!(await handleQuestion(cursor.questionId, cursor.lastChildUpdate))) return stop();
	}

	for (;;) {
		const page = await fetchQuestionPage(db, since, cursor, pageSize);
		for (const question of page) {
			if (!(await handleQuestion(question.statementId, question.lastChildUpdate ?? 0))) {
				return stop();
			}
		}
		if (page.length < pageSize) break;
		if (now() >= deadline) return stop();
	}

	await saveState(db, {
		cursor: null,
		passStartedAt: state.passStartedAt,
		lastPassCompletedAt: now(),
		lastCompletedPassStartedAt: state.passStartedAt,
	});
	result.status = 'completed';
	logger.info('condensation.runClusterReconcile.completed', { ...result });

	return result;
}
