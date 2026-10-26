jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('./helpers/memoryFirestore').firestoreModule,
);

import type { Firestore } from 'firebase-admin/firestore';
import type { Statement } from '@freedi/shared-types';
import {
	RECONCILE_ACTIVE_WINDOW_MS,
	RECONCILE_MIN_PASS_INTERVAL_MS,
	RECONCILE_STATE_COLLECTION,
	RECONCILE_STATE_DOC,
	planTick,
	runClusterReconcile,
	selectClustersToReconcile,
	type ReconcileState,
} from '../clusterReconcile';
import { recomputeClusterEvaluation } from '../aggregation';
import { memoryFirestore, peekDoc, resetStore, seedDoc } from './helpers/memoryFirestore';

const db = memoryFirestore as unknown as Firestore;
const NOW = 1_800_000_000_000;
const ACTIVE = NOW - 1000;
const DORMANT = NOW - RECONCILE_ACTIVE_WINDOW_MS - 1000;

function cluster(id: string, parentId: string, extra: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		parentId,
		isCluster: true,
		integratedOptions: ['m1'],
		...extra,
	} as Statement;
}

function question(id: string, lastChildUpdate: number): Statement {
	return { statementId: id, parentId: 'top', lastChildUpdate, lastUpdate: 0 } as Statement;
}

describe('selectClustersToReconcile', () => {
	it('keeps visible clusters under active questions only', () => {
		const questions = new Map([
			['qa', question('qa', ACTIVE)],
			['qd', question('qd', DORMANT)],
		]);
		const picked = selectClustersToReconcile(
			[
				cluster('c1', 'qa'),
				cluster('c2', 'qa', { hide: true }),
				cluster('c3', 'qd'),
				cluster('c4', 'missing'),
				cluster('c5', 'qa', { isCluster: false }),
			],
			questions,
			NOW - RECONCILE_ACTIVE_WINDOW_MS,
		);

		expect(picked.map((c) => c.statementId)).toEqual(['c1']);
	});
});

describe('planTick', () => {
	const base: ReconcileState = { cursor: null, passStartedAt: 0, lastPassCompletedAt: 0 };

	it('continues a pass that has a cursor', () => {
		expect(planTick({ ...base, cursor: 'c9', lastPassCompletedAt: NOW }, NOW)).toBe('continue');
	});

	it('idles after a pass completed recently', () => {
		expect(planTick({ ...base, lastPassCompletedAt: NOW - 1000 }, NOW)).toBe('idle');
	});

	it('starts a new pass the next night', () => {
		expect(
			planTick({ ...base, lastPassCompletedAt: NOW - RECONCILE_MIN_PASS_INTERVAL_MS - 1 }, NOW),
		).toBe('start');
	});
});

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

/** Five clusters under an active question, one under a dormant one. */
function seedWorld(): void {
	seedDoc('statements', 'qa', question('qa', ACTIVE) as unknown as Record<string, unknown>);
	seedDoc('statements', 'qd', question('qd', DORMANT) as unknown as Record<string, unknown>);
	for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) {
		seedDoc('statements', id, cluster(id, 'qa') as unknown as Record<string, unknown>);
	}
	seedDoc('statements', 'cd', cluster('cd', 'qd') as unknown as Record<string, unknown>);
	seedEval('A', 'm1', 1);
	// A direct vote on c1 must win over the member vote.
	seedEval('B', 'c1', -1);
	seedEval('B', 'm1', 1);
}

const stored = (id: string): Statement => peekDoc('statements', id) as Statement;

describe('runClusterReconcile', () => {
	beforeEach(() => {
		resetStore();
		seedWorld();
	});

	it('recomputes every active cluster with the unified rule and skips dormant ones', async () => {
		const result = await runClusterReconcile(db, { now: () => NOW });

		expect(result.status).toBe('completed');
		expect(result.eligible).toBe(5);
		expect(result.recomputed).toBe(5);
		expect(stored('c1').evaluation?.sumEvaluations).toBeCloseTo(1 - 1);
		expect(stored('c2').evaluation?.sumEvaluations).toBeCloseTo(1 + 1);
		expect(stored('cd').evaluation).toBeUndefined();
	});

	it('writes nothing for clusters whose score is already correct', async () => {
		await recomputeClusterEvaluation('c1');
		const before = stored('c1').lastUpdate;

		const result = await runClusterReconcile(db, { now: () => NOW });

		expect(result.recomputed).toBe(4);
		expect(stored('c1').lastUpdate).toBe(before);
	});

	it('stops at the time budget, saves the cursor, and resumes there', async () => {
		let clock = NOW;
		// Each read of the clock advances time, so the budget runs out after one page.
		const tick = (): number => (clock += 10);

		const first = await runClusterReconcile(db, { now: tick, pageSize: 2, timeBudgetMs: 35 });
		expect(first.status).toBe('partial');
		expect(first.cursor).toBe('c2');
		const saved = peekDoc(
			RECONCILE_STATE_COLLECTION,
			RECONCILE_STATE_DOC,
		) as unknown as ReconcileState;
		expect(saved.cursor).toBe('c2');
		expect(stored('c3').evaluation).toBeUndefined();

		const second = await runClusterReconcile(db, { now: () => NOW + 100, pageSize: 2 });
		expect(second.status).toBe('completed');
		expect(stored('c5').evaluation?.numberOfEvaluators).toBe(2);
		const done = peekDoc(
			RECONCILE_STATE_COLLECTION,
			RECONCILE_STATE_DOC,
		) as unknown as ReconcileState;
		expect(done.cursor).toBeNull();
		expect(done.passStartedAt).toBe(saved.passStartedAt);
	});

	it('idles on the next tick after a completed pass', async () => {
		await runClusterReconcile(db, { now: () => NOW });
		const again = await runClusterReconcile(db, { now: () => NOW + 1000 });

		expect(again.status).toBe('idle');
		expect(again.scanned).toBe(0);
	});
});
