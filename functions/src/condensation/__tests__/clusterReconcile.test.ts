jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('./helpers/memoryFirestore').firestoreModule,
);

import type { Firestore } from 'firebase-admin/firestore';
import { StatementType, type Statement } from '@freedi/shared-types';
import {
	RECONCILE_ACTIVE_WINDOW_MS,
	RECONCILE_MIN_PASS_INTERVAL_MS,
	RECONCILE_STATE_COLLECTION,
	RECONCILE_STATE_DOC,
	activitySince,
	clustersToHandle,
	planTick,
	runClusterReconcile,
	type ReconcileState,
} from '../clusterReconcile';
import { recomputeClusterEvaluation } from '../aggregation';
import { memoryFirestore, peekDoc, resetStore, seedDoc } from './helpers/memoryFirestore';

const db = memoryFirestore as unknown as Firestore;
const NOW = 1_800_000_000_000;
const ACTIVE = NOW - 1000;
const DORMANT = NOW - RECONCILE_ACTIVE_WINDOW_MS - 1000;
const BASE: ReconcileState = {
	cursor: null,
	passStartedAt: 0,
	lastPassCompletedAt: 0,
	lastCompletedPassStartedAt: 0,
};

type Doc = Record<string, unknown>;

function cluster(id: string, parentId: string, extra: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		parentId,
		isCluster: true,
		integratedOptions: ['m1'],
		...extra,
	} as Statement;
}

function seedQuestion(id: string, lastChildUpdate: number): void {
	seedDoc('statements', id, {
		statementId: id,
		parentId: 'top',
		statementType: StatementType.question,
		lastChildUpdate,
		lastUpdate: 0,
	});
}

function seedEval(evaluatorId: string, statementId: string, evaluation: number): void {
	seedDoc('evaluations', `${evaluatorId}--${statementId}`, {
		evaluationId: `${evaluatorId}--${statementId}`,
		evaluatorId,
		statementId,
		parentId: 'qa',
		evaluation,
		updatedAt: 1,
	});
}

/** Five clusters (and a hidden one) under an active question, one under a dormant one. */
function seedWorld(): void {
	seedQuestion('qa', ACTIVE);
	seedQuestion('qd', DORMANT);
	for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) {
		seedDoc('statements', id, cluster(id, 'qa') as unknown as Doc);
	}
	seedDoc('statements', 'ch', cluster('ch', 'qa', { hide: true }) as unknown as Doc);
	seedDoc('statements', 'cd', cluster('cd', 'qd') as unknown as Doc);
	seedEval('A', 'm1', 1);
	// A direct vote on c1 must win over the member vote.
	seedEval('B', 'c1', -1);
	seedEval('B', 'm1', 1);
}

const stored = (id: string): Statement => peekDoc('statements', id) as Statement;
const savedState = (): ReconcileState =>
	peekDoc(RECONCILE_STATE_COLLECTION, RECONCILE_STATE_DOC) as unknown as ReconcileState;

describe('planTick', () => {
	it('continues a pass that has a cursor', () => {
		const cursor = { questionId: 'q', lastChildUpdate: 1, clusterId: 'c9' };
		expect(planTick({ ...BASE, cursor, lastPassCompletedAt: NOW }, NOW)).toBe('continue');
	});

	it('idles after a pass completed recently', () => {
		expect(planTick({ ...BASE, lastPassCompletedAt: NOW - 1000 }, NOW)).toBe('idle');
	});

	it('starts a new pass the next night', () => {
		expect(
			planTick({ ...BASE, lastPassCompletedAt: NOW - RECONCILE_MIN_PASS_INTERVAL_MS - 1 }, NOW),
		).toBe('start');
	});
});

describe('activitySince', () => {
	it('is the 30-day window on the first pass', () => {
		expect(activitySince({ ...BASE, passStartedAt: NOW })).toBe(NOW - RECONCILE_ACTIVE_WINDOW_MS);
	});

	it('is the start of the last completed pass when that is later', () => {
		expect(
			activitySince({ ...BASE, passStartedAt: NOW, lastCompletedPassStartedAt: NOW - 1000 }),
		).toBe(NOW - 1000);
	});
});

describe('clustersToHandle', () => {
	it('keeps visible clusters in id order after the cursor', () => {
		const picked = clustersToHandle(
			[
				cluster('c3', 'q'),
				cluster('c1', 'q'),
				cluster('c2', 'q', { hide: true }),
				cluster('c4', 'q', { isCluster: false }),
				cluster('c5', 'q'),
			],
			'c1',
		);

		expect(picked.map((c) => c.statementId)).toEqual(['c3', 'c5']);
	});
});

describe('runClusterReconcile', () => {
	beforeEach(() => {
		resetStore();
		seedWorld();
	});

	it('recomputes every visible cluster of active questions with the unified rule', async () => {
		const result = await runClusterReconcile(db, { now: () => NOW });

		expect(result.status).toBe('completed');
		expect(result.questions).toBe(1);
		expect(result.checked).toBe(5);
		expect(result.recomputed).toBe(5);
		expect(stored('c1').evaluation?.sumEvaluations).toBeCloseTo(1 - 1);
		expect(stored('c2').evaluation?.sumEvaluations).toBeCloseTo(1 + 1);
		expect(stored('ch').evaluation).toBeUndefined();
		expect(stored('cd').evaluation).toBeUndefined();
	});

	it('writes nothing for clusters whose score is already correct', async () => {
		await recomputeClusterEvaluation('c1');
		const before = stored('c1').lastUpdate;

		const result = await runClusterReconcile(db, { now: () => NOW });

		expect(result.recomputed).toBe(4);
		expect(stored('c1').lastUpdate).toBe(before);
	});

	it('the next night skips questions with no activity since the last pass', async () => {
		await runClusterReconcile(db, { now: () => NOW });
		const nextNight = NOW + RECONCILE_MIN_PASS_INTERVAL_MS + 1;

		const quiet = await runClusterReconcile(db, { now: () => nextNight });
		expect(quiet.status).toBe('completed');
		expect(quiet.checked).toBe(0);

		seedQuestion('qa', nextNight + 1);
		const busy = await runClusterReconcile(db, {
			now: () => nextNight + RECONCILE_MIN_PASS_INTERVAL_MS + 2,
		});
		expect(busy.checked).toBe(5);
	});

	it('a deadline reached mid-question saves the last handled cluster and resumes after it', async () => {
		let clock = NOW;
		// Every clock read advances 10 ms: the budget runs out before the 3rd cluster.
		const tick = (): number => (clock += 10);

		const first = await runClusterReconcile(db, { now: tick, timeBudgetMs: 45 });
		expect(first.status).toBe('partial');
		expect(first.checked).toBe(2);
		expect(savedState().cursor).toEqual({
			questionId: 'qa',
			lastChildUpdate: ACTIVE,
			clusterId: 'c2',
		});
		expect(stored('c3').evaluation).toBeUndefined();

		const second = await runClusterReconcile(db, { now: () => NOW + 100 });
		expect(second.status).toBe('completed');
		expect(second.checked).toBe(3);
		expect(stored('c5').evaluation?.numberOfEvaluators).toBe(2);
		expect(savedState().cursor).toBeNull();
		expect(savedState().lastCompletedPassStartedAt).toBe(NOW + 30);
	});

	it('pages through questions and resumes between pages', async () => {
		seedQuestion('qb', ACTIVE - 10);
		seedDoc('statements', 'cb', cluster('cb', 'qb') as unknown as Doc);

		const result = await runClusterReconcile(db, { now: () => NOW, pageSize: 1 });

		expect(result.status).toBe('completed');
		expect(result.questions).toBe(2);
		expect(stored('cb').evaluation?.numberOfEvaluators).toBe(2);
	});

	it('idles on the next tick after a completed pass', async () => {
		await runClusterReconcile(db, { now: () => NOW });
		const again = await runClusterReconcile(db, { now: () => NOW + 1000 });

		expect(again.status).toBe('idle');
		expect(again.checked).toBe(0);
	});
});
