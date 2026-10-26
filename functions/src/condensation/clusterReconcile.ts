import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
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
 * Every visible cluster under a question with activity in the last
 * RECONCILE_ACTIVE_WINDOW_MS is recomputed with the one cluster vote rule
 * (`clusterVoteRule.ts`). This repairs scores left stale by a missed enqueue,
 * a failed trigger, or a writer that used older semantics.
 *
 * Bounded: clusters are paged RECONCILE_PAGE_SIZE at a time and the run stops
 * at RECONCILE_TIME_BUDGET_MS, saving a cursor in RECONCILE_STATE_DOC. The
 * next tick resumes there. A finished pass is not restarted until
 * RECONCILE_MIN_PASS_INTERVAL_MS has passed, so several ticks per night give
 * one full pass per night.
 *
 * Writes only when the stored score drifted from the recomputed one, so a
 * healthy cluster costs reads only (and fires no statement triggers).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const RECONCILE_ACTIVE_WINDOW_DAYS = 30;
export const RECONCILE_ACTIVE_WINDOW_MS = RECONCILE_ACTIVE_WINDOW_DAYS * DAY_MS;
export const RECONCILE_PAGE_SIZE = 200;
/** getAll() batch size when loading parent questions. */
export const RECONCILE_PARENT_READ_CHUNK = 100;
/** Leaves headroom under the 540 s function timeout. */
export const RECONCILE_TIME_BUDGET_MS = 420 * 1000;
export const RECONCILE_MIN_PASS_INTERVAL_MS = 20 * HOUR_MS;
/** Score differences smaller than this are rounding, not drift. */
export const RECONCILE_DRIFT_EPSILON = 1e-6;
export const RECONCILE_STATE_COLLECTION = '_maintenance';
export const RECONCILE_STATE_DOC = 'nightlyClusterReconcile';

export interface ReconcileState {
	/** Last cluster id handled in the current pass; null = no pass in progress. */
	cursor: string | null;
	passStartedAt: number;
	lastPassCompletedAt: number;
}

export interface ReconcileRunResult {
	status: 'idle' | 'partial' | 'completed';
	scanned: number;
	eligible: number;
	recomputed: number;
	failed: number;
	cursor: string | null;
}

export interface ReconcileOptions {
	now?: () => number;
	pageSize?: number;
	timeBudgetMs?: number;
}

const EMPTY_STATE: ReconcileState = { cursor: null, passStartedAt: 0, lastPassCompletedAt: 0 };

/** A question counts as active when it or any child changed inside the window. */
export function isQuestionActive(question: Statement | undefined, cutoff: number): boolean {
	if (!question) return false;
	const lastActivity = Math.max(question.lastChildUpdate ?? 0, question.lastUpdate ?? 0);

	return lastActivity >= cutoff;
}

/** Visible clusters whose question is active. */
export function selectClustersToReconcile(
	clusters: Statement[],
	questions: Map<string, Statement>,
	cutoff: number,
): Statement[] {
	return clusters.filter(
		(c) =>
			c.isCluster === true &&
			c.hide !== true &&
			isQuestionActive(questions.get(c.parentId), cutoff),
	);
}

/** Should this tick do nothing, continue a pass, or start a new one? */
export function planTick(state: ReconcileState, now: number): 'idle' | 'continue' | 'start' {
	if (state.cursor !== null) return 'continue';
	if (now - state.lastPassCompletedAt < RECONCILE_MIN_PASS_INTERVAL_MS) return 'idle';

	return 'start';
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

async function loadQuestions(db: Firestore, parentIds: string[]): Promise<Map<string, Statement>> {
	const out = new Map<string, Statement>();
	for (let i = 0; i < parentIds.length; i += RECONCILE_PARENT_READ_CHUNK) {
		const refs = parentIds
			.slice(i, i + RECONCILE_PARENT_READ_CHUNK)
			.map((id) => db.collection(Collections.statements).doc(id));
		const snaps = await db.getAll(...refs);
		snaps.forEach((s) => {
			if (s.exists) out.set(s.id, s.data() as Statement);
		});
	}

	return out;
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

export async function runClusterReconcile(
	db: Firestore,
	options: ReconcileOptions = {},
): Promise<ReconcileRunResult> {
	const now = options.now ?? Date.now;
	const pageSize = options.pageSize ?? RECONCILE_PAGE_SIZE;
	const deadline = now() + (options.timeBudgetMs ?? RECONCILE_TIME_BUDGET_MS);
	const result: ReconcileRunResult = {
		status: 'idle',
		scanned: 0,
		eligible: 0,
		recomputed: 0,
		failed: 0,
		cursor: null,
	};

	let state = await loadState(db);
	const plan = planTick(state, now());
	if (plan === 'idle') return result;
	if (plan === 'start') state = { ...state, cursor: null, passStartedAt: now() };
	const cutoff = state.passStartedAt - RECONCILE_ACTIVE_WINDOW_MS;
	let cursor = state.cursor;

	while (now() < deadline) {
		let query = db
			.collection(Collections.statements)
			.where('isCluster', '==', true)
			.orderBy('__name__')
			.limit(pageSize);
		if (cursor) query = query.startAfter(cursor);
		const snap = await query.get();
		const clusters = snap.docs.map((d) => d.data() as Statement);
		result.scanned += clusters.length;

		const questions = await loadQuestions(db, [...new Set(clusters.map((c) => c.parentId))]);
		const eligible = selectClustersToReconcile(clusters, questions, cutoff);
		result.eligible += eligible.length;

		for (const cluster of eligible) {
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

		if (snap.docs.length < pageSize) {
			await saveState(db, {
				cursor: null,
				passStartedAt: state.passStartedAt,
				lastPassCompletedAt: now(),
			});
			result.status = 'completed';
			result.cursor = null;
			logger.info('condensation.runClusterReconcile.completed', { ...result });

			return result;
		}

		// Page fully handled: save the cursor so a timeout loses at most one page.
		cursor = snap.docs[snap.docs.length - 1].id;
		await saveState(db, { ...state, cursor });
	}

	result.status = 'partial';
	result.cursor = cursor;
	logger.info('condensation.runClusterReconcile.partial', { ...result });

	return result;
}
