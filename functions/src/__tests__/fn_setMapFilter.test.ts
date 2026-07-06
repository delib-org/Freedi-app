import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';
import { StatementType } from '@freedi/shared-types';

// Avoid importing the real ./index (which calls getFirestore on an
// uninitialized app). applyMapFilter takes its Firestore as an argument.
jest.mock('../index', () => ({ db: {} }));
jest.mock('firebase-functions', () => ({ logger: { info: jest.fn() } }));

import { applyMapFilter, SetMapFilterRequest } from '../fn_setMapFilter';

interface DocData {
	statementType?: unknown;
	statementSettings?: { map?: { allowViewerFilter?: boolean } };
}

function makeDb(doc: DocData | null): { firestore: Firestore; set: jest.Mock } {
	const set = jest.fn(async () => undefined);
	const get = jest.fn(async () => ({
		exists: doc !== null,
		data: () => doc,
	}));
	const docRef = { get, set };
	const firestore = {
		collection: jest.fn(() => ({ doc: jest.fn(() => docRef) })),
	} as unknown as Firestore;

	return { firestore, set };
}

const baseReq: SetMapFilterRequest = {
	statementId: 'q1',
	filterMetric: 'consensus',
	minConsensus: 0.3,
	minAverageEvaluation: -1,
};

describe('applyMapFilter', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('rejects an unauthenticated caller', async () => {
		const { firestore } = makeDb(null);
		await expect(applyMapFilter(firestore, undefined, baseReq)).rejects.toThrow(/authenticated/i);
	});

	it('rejects when the statement is missing', async () => {
		const { firestore } = makeDb(null);
		await expect(applyMapFilter(firestore, 'u1', baseReq)).rejects.toThrow(/not found/i);
	});

	it('rejects a non-question statement', async () => {
		const { firestore } = makeDb({
			statementType: StatementType.option,
			statementSettings: { map: { allowViewerFilter: true } },
		});
		await expect(applyMapFilter(firestore, 'u1', baseReq)).rejects.toThrow(/questions only/i);
	});

	it('rejects when viewer filtering is not enabled', async () => {
		const { firestore } = makeDb({
			statementType: StatementType.question,
			statementSettings: { map: { allowViewerFilter: false } },
		});
		await expect(applyMapFilter(firestore, 'u1', baseReq)).rejects.toThrow(/not enabled/i);
	});

	it('rejects an invalid filterMetric', async () => {
		const { firestore } = makeDb({
			statementType: StatementType.question,
			statementSettings: { map: { allowViewerFilter: true } },
		});
		await expect(
			applyMapFilter(firestore, 'u1', {
				...baseReq,
				filterMetric: 'bogus' as SetMapFilterRequest['filterMetric'],
			}),
		).rejects.toThrow(/invalid/i);
	});

	it('writes only the filter fields (merged) and clamps thresholds when enabled', async () => {
		const { firestore, set } = makeDb({
			statementType: StatementType.question,
			statementSettings: { map: { allowViewerFilter: true } },
		});
		const res = await applyMapFilter(firestore, 'u1', {
			statementId: 'q1',
			filterMetric: 'consensus',
			minConsensus: 5, // out of range → clamps to 1
			minAverageEvaluation: -9, // out of range → clamps to -1
		});

		expect(res).toEqual({ success: true });
		expect(set).toHaveBeenCalledTimes(1);
		const [payload, options] = set.mock.calls[0] as [
			{ statementSettings: { map: Record<string, unknown> } },
			{ merge: boolean },
		];
		expect(options).toEqual({ merge: true });
		expect(payload.statementSettings.map).toEqual({
			filterMetric: 'consensus',
			minConsensus: 1,
			minAverageEvaluation: -1,
		});
		// Must not touch admin-only fields like allowViewerFilter or fonts.
		expect(payload.statementSettings.map).not.toHaveProperty('allowViewerFilter');
		expect(payload.statementSettings.map).not.toHaveProperty('cardFontRem');
	});
});
