jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('../../condensation/__tests__/helpers/memoryFirestore').firestoreModule,
);

import type { Firestore } from 'firebase-admin/firestore';
import type { Statement } from '@freedi/shared-types';
import {
	backfillAbsorbedClusterVotes,
	formatBackfillReport,
} from '../backfillAbsorbedClusterVotes';
import { checkBackfillRun } from '../backfillRunGuard';
import {
	memoryFirestore,
	peekDoc,
	resetStore,
	seedDoc,
} from '../../condensation/__tests__/helpers/memoryFirestore';

const db = memoryFirestore as unknown as Firestore;

function seedCluster(id: string, members: string[], extra: Partial<Statement> = {}): void {
	seedDoc('statements', id, {
		statementId: id,
		parentId: 'q1',
		isCluster: true,
		integratedOptions: members,
		evaluation: { numberOfEvaluators: 1, evaluationRandomNumber: 0.5, viewed: 0 },
		consensus: 0.1,
		...extra,
	} as Partial<Statement>);
}

function seedEval(evaluatorId: string, statementId: string, evaluation: number): void {
	seedDoc('evaluations', `${evaluatorId}--${statementId}`, {
		evaluationId: `${evaluatorId}--${statementId}`,
		evaluatorId,
		statementId,
		parentId: 'q1',
		evaluation,
		updatedAt: 1,
	});
}

/**
 * A (visible) <- B (pipeline loser, mergedInto A) <- C (mergedInto B).
 * D is a claim loser: hidden, no mergedInto, members a subset of A.
 */
function seedWorld(): void {
	seedCluster('A', ['m1', 'm2', 'm3']);
	seedCluster('B', [], { hide: true, mergedInto: 'A' });
	seedCluster('C', [], { hide: true, mergedInto: 'B' });
	seedCluster('D', ['m1', 'm2'], { hide: true });
	seedEval('U0', 'A', 1);
	seedEval('U1', 'B', 1);
	seedEval('U2', 'C', -1);
	seedEval('U3', 'D', 1);
}

const statement = (id: string): Statement => peekDoc('statements', id) as Statement;

describe('backfillAbsorbedClusterVotes', () => {
	beforeEach(() => {
		resetStore();
		seedWorld();
	});

	it('dry run reports orphaned votes and writes nothing', async () => {
		const report = await backfillAbsorbedClusterVotes(db, { execute: false });

		expect(report.rows).toHaveLength(1);
		const row = report.rows[0];
		expect(row.winnerId).toBe('A');
		expect([...row.addedAbsorbedIds].sort()).toEqual(['B', 'C', 'D']);
		expect(row.orphanedDirectVotes).toBe(3);
		expect(row.evaluatorsAfter).toBe(4);
		expect(statement('A').absorbedClusterIds).toBeUndefined();
		expect(statement('D').mergedInto).toBeUndefined();
		expect(formatBackfillReport(report)).toContain('question q1');
	});

	it('execute writes the field, links claim losers and recomputes the winner', async () => {
		await backfillAbsorbedClusterVotes(db, { execute: true });

		const a = statement('A');
		expect([...(a.absorbedClusterIds ?? [])].sort()).toEqual(['B', 'C', 'D']);
		expect(a.evaluation?.numberOfEvaluators).toBe(4);
		expect(a.evaluation?.sumEvaluations).toBeCloseTo(1 + 1 - 1 + 1);
		expect(statement('D').mergedInto).toBe('A');
	});

	it('is idempotent: a second run has nothing to add', async () => {
		await backfillAbsorbedClusterVotes(db, { execute: true });
		const second = await backfillAbsorbedClusterVotes(db, { execute: false });

		expect(second.rows).toHaveLength(0);
	});

	it('skips a claim loser that fits several winners', async () => {
		seedCluster('E', ['m1', 'm2']);
		const report = await backfillAbsorbedClusterVotes(db, { execute: false });

		expect(report.skipped).toEqual([{ loserId: 'D', reason: 'several possible winners' }]);
	});
});

describe('checkBackfillRun', () => {
	const base = { emulatorHost: undefined, argv: ['node', 'script'] };

	it('is a dry run unless --execute', () => {
		expect(checkBackfillRun({ ...base, project: 'freedi-test' })).toEqual({
			ok: true,
			project: 'freedi-test',
			execute: false,
		});
	});

	it('refuses --execute on prod without --confirm-prod', () => {
		const result = checkBackfillRun({
			...base,
			project: 'synthesistalyaron',
			argv: ['--execute'],
		});
		expect(result.ok).toBe(false);
	});

	it('allows prod with --confirm-prod, and a prod id on the emulator', () => {
		expect(
			checkBackfillRun({
				...base,
				project: 'synthesistalyaron',
				argv: ['--execute', '--confirm-prod'],
			}).ok,
		).toBe(true);
		expect(
			checkBackfillRun({
				project: 'synthesistalyaron',
				emulatorHost: '127.0.0.1:8101',
				argv: ['--execute'],
			}).ok,
		).toBe(true);
	});

	it('requires a project', () => {
		expect(checkBackfillRun({ ...base, project: undefined }).ok).toBe(false);
	});
});
