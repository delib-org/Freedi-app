import type { Statement } from '@freedi/shared-types';

/**
 * Questions with fewer than two syntheses are skipped by the merge sweep; the
 * file-only visit makes sure their unthemed atoms are still re-offered when a
 * live theme exists, under the same unchanged / dormant gates.
 */

const parentDocs = new Map<string, Statement>();

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: jest.fn(() => ({
		collection: jest.fn(() => ({
			doc: (id: string) => ({
				get: async () => ({ exists: parentDocs.has(id), data: () => parentDocs.get(id) }),
			}),
		})),
	})),
}));

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const fileUnthemedAtoms = jest.fn();
jest.mock('../pipeline/fileUnthemed', () => ({
	fileUnthemedAtoms: (...args: unknown[]) => fileUnthemedAtoms(...args),
}));

const loadSweepState = jest.fn();
const saveSweepState = jest.fn();
jest.mock('../scheduled/reJudgeSweepState', () => {
	const actual = jest.requireActual('../scheduled/reJudgeSweepState');

	return {
		...actual,
		loadSweepState: (...args: unknown[]) => loadSweepState(...args),
		saveSweepState: (...args: unknown[]) => saveSweepState(...args),
	};
});

import {
	fileOnlyProcessParent,
	selectFileOnlyParents,
	sweepFileOnlyParents,
} from '../scheduled/reJudgeFileOnly';
import { computeParentFingerprint, DORMANT_AFTER_MS } from '../scheduled/reJudgeSweepState';

const NOW = 1_800_000_000_000;

const stmt = (id: string, parentId: string, extra: Record<string, unknown> = {}): Statement =>
	({ statementId: id, parentId, statement: id, ...extra }) as unknown as Statement;

const theme = (id: string, parentId: string): Statement =>
	stmt(id, parentId, { isCluster: true, derivedByPipeline: 'topic-cluster', hide: false });

beforeEach(() => {
	jest.clearAllMocks();
	parentDocs.clear();
	loadSweepState.mockResolvedValue(null);
	fileUnthemedAtoms.mockResolvedValue({ atoms: 2, filed: 1, refused: 1, skipped: 0, errors: 0 });
});

describe('selectFileOnlyParents', () => {
	it('visits parents with a live theme and 0 or 1 synths, not those with 2+', () => {
		const synthsByParent = new Map<string, Statement[]>([
			['qOne', [stmt('s1', 'qOne')]],
			['qTwo', [stmt('s2', 'qTwo'), stmt('s3', 'qTwo')]],
		]);
		const themes = [
			theme('t1', 'qZero'),
			theme('t2', 'qOne'),
			theme('t3', 'qTwo'),
			theme('t4', 'qZero'),
		];

		const selected = selectFileOnlyParents(synthsByParent, themes);

		expect([...selected.keys()].sort()).toEqual(['qOne', 'qZero']);
		expect(selected.get('qOne')).toHaveLength(1);
		expect(selected.get('qZero')).toEqual([]);
	});

	it('a parent with syntheses but no theme is not visited', () => {
		const selected = selectFileOnlyParents(new Map([['q', [stmt('s1', 'q')]]]), []);

		expect(selected.size).toBe(0);
	});
});

describe('fileOnlyProcessParent', () => {
	it('runs ONLY the file-unthemed step and records the sweep state', async () => {
		parentDocs.set('q1', stmt('q1', 'root', { statement: 'Question?', lastChildUpdate: NOW - 1 }));

		const result = await fileOnlyProcessParent('q1', [], NOW);

		expect(result.skipped).toBe(false);
		expect(fileUnthemedAtoms).toHaveBeenCalledWith('q1', 'Question?', 'reJudge:fileOnly');
		expect(saveSweepState).toHaveBeenCalledWith('q1', expect.any(String), [], NOW);
	});

	it('skips an unchanged parent within the staleness floor', async () => {
		const parent = stmt('q1', 'root', { lastChildUpdate: NOW - 1 });
		parentDocs.set('q1', parent);
		loadSweepState.mockResolvedValue({
			fingerprint: computeParentFingerprint([], parent),
			rejectedPairs: [],
			lastSweptAt: NOW - 1000,
		});

		const result = await fileOnlyProcessParent('q1', [], NOW);

		expect(result).toEqual({ skipped: true, skipReason: 'unchanged' });
		expect(fileUnthemedAtoms).not.toHaveBeenCalled();
	});

	it('skips a dormant parent even when overdue', async () => {
		const parent = stmt('q1', 'root', { lastChildUpdate: NOW - DORMANT_AFTER_MS - 1 });
		parentDocs.set('q1', parent);
		loadSweepState.mockResolvedValue({
			fingerprint: computeParentFingerprint([], parent),
			rejectedPairs: [],
			lastSweptAt: 0,
		});

		const result = await fileOnlyProcessParent('q1', [], NOW);

		expect(result.skipReason).toBe('dormant');
		expect(fileUnthemedAtoms).not.toHaveBeenCalled();
	});
});

describe('sweepFileOnlyParents', () => {
	it('stops after the budget of parents that did real work', async () => {
		const parents = new Map<string, Statement[]>([
			['a', []],
			['b', []],
			['c', []],
		]);

		const summary = await sweepFileOnlyParents(parents, 2, NOW);

		expect(summary.processed).toBe(2);
		expect(fileUnthemedAtoms).toHaveBeenCalledTimes(2);
	});

	it('a failing parent is counted and does not stop the sweep', async () => {
		fileUnthemedAtoms.mockRejectedValueOnce(new Error('boom'));

		const summary = await sweepFileOnlyParents(
			new Map<string, Statement[]>([
				['a', []],
				['b', []],
			]),
			5,
			NOW,
		);

		expect(summary.processed).toBe(2);
		expect(fileUnthemedAtoms).toHaveBeenCalledTimes(2);
	});
});
