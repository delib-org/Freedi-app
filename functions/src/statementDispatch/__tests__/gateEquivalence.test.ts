import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Holds the rule in routeGates.ts against the real handler code: wherever a gate
 * says no, the real handler must do nothing. Most handlers exit before touching
 * Firestore. Three read their settings first and only then compare scores; those
 * get settings under which any crossing would act, and must still write nothing.
 */
const mockWrite = jest.fn();
const mockWhere = jest.fn();
const mockBatch = jest.fn();
const mockRunTransaction = jest.fn();
const mockCollection = jest.fn();
const mockTopLevelDoc = jest.fn();
const mockDb = {
	collection: mockCollection,
	doc: mockTopLevelDoc,
	batch: mockBatch,
	runTransaction: mockRunTransaction,
};

jest.mock('firebase-functions/v2/firestore', () => {
	const trigger = (_options: unknown, handler: (event: unknown) => unknown) =>
		Object.assign((event: unknown) => handler(event), { run: handler });

	return {
		onDocumentCreated: trigger,
		onDocumentUpdated: trigger,
		onDocumentDeleted: trigger,
		onDocumentWritten: trigger,
	};
});
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => mockDb,
	FieldValue: { increment: jest.fn(), arrayUnion: jest.fn(), delete: jest.fn() },
	Timestamp: { fromMillis: jest.fn(), now: jest.fn() },
}));
jest.mock('../../db', () => ({ db: mockDb }));
jest.mock('../../index', () => ({ db: mockDb }));
jest.mock('../../deliberation/service', () => ({
	act: jest.fn(),
	generate: jest.fn(),
	questionFor: jest.fn(),
}));
jest.mock('../../deliberation/policy', () => ({
	POLICY: { callableSeconds: 60, batchSize: 1, schedulerBudgetMs: 1 },
	retryState: jest.fn(),
}));
jest.mock('../../condensation/pipeline', () => ({ runCondensationPipeline: jest.fn() }));
jest.mock('../../condensation/authorNotifications', () => ({ notifyAuthorsOfGrouping: jest.fn() }));
jest.mock('../../condensation/recomputeAffectedClusters', () => ({
	recomputeAffectedClusters: jest.fn(),
}));
jest.mock('../../engagement/joinForm/getGoogleSheetsClient', () => ({
	extractSheetId: jest.fn(),
	getGoogleSheetsClient: jest.fn(),
}));
jest.mock('../../organizations/studio/surveyWriter', () => ({ syncSurveyStatus: jest.fn() }));
jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));

import type { Statement } from '@freedi/shared-types';
import { getGoogleSheetsClient } from '../../engagement/joinForm/getGoogleSheetsClient';
import { syncSurveyStatus } from '../../organizations/studio/surveyWriter';
import { STATEMENT_ROUTES, routeMatches } from '../routes';
import type { StatementChange } from '../routeGates';
import { buildEvent, Scenario, SCENARIOS } from './statementWriteFixtures';

const READS_SETTINGS_BEFORE_SCORE_CHECK: readonly string[] = [
	'fn_autoAddParagraph',
	'fn_autoRemoveParagraph',
	'fn_createReplacementQueueItem',
];

/** Thresholds that every fixture score meets, on an open insertion point. */
const ACTIVE_SETTINGS_DOC = {
	doc: {
		isInsertionPoint: true,
		versionControlSettings: {
			enabled: true,
			reviewThreshold: 0.15,
			consensusSettings: { removalThreshold: 0.15, additionThreshold: 0.15, minEvaluators: 1 },
		},
	},
};

function toChange(scenario: Scenario): StatementChange {
	const before = scenario.before as Statement | undefined;
	const after = scenario.after as Statement | undefined;
	const kind = before && after ? 'update' : after ? 'create' : 'delete';

	return { kind, before, after };
}

/** Update-only handlers never received create or delete events, so only updates count for them. */
const skippedPairs = STATEMENT_ROUTES.flatMap((statementRoute) =>
	SCENARIOS.filter((scenario) => {
		const change = toChange(scenario);
		if (statementRoute.event === 'update' && change.kind !== 'update') return false;

		return !routeMatches(statementRoute, change);
	}).map((scenario) => ({
		routeName: statementRoute.name,
		label: scenario.label,
		statementRoute,
		scenario,
	})),
);

function refuseFirestore(): void {
	[mockCollection, mockTopLevelDoc, mockBatch, mockRunTransaction].forEach((mock) => {
		mock.mockImplementation(() => {
			throw new Error('handler touched Firestore');
		});
	});
}

function allowSettingsReads(): void {
	mockCollection.mockImplementation(() => ({
		doc: () => ({
			get: () => Promise.resolve({ exists: true, data: () => ACTIVE_SETTINGS_DOC }),
			set: mockWrite,
			update: mockWrite,
		}),
		where: mockWhere,
	}));
}

function expectNoWrites(event: ReturnType<typeof buildEvent>): void {
	const afterRef = (event.data?.after as unknown as { ref: { update: jest.Mock } }).ref;

	expect(mockWrite).not.toHaveBeenCalled();
	expect(mockBatch).not.toHaveBeenCalled();
	expect(mockRunTransaction).not.toHaveBeenCalled();
	expect(mockWhere).not.toHaveBeenCalled();
	expect(afterRef.update).not.toHaveBeenCalled();
	expect(syncSurveyStatus).not.toHaveBeenCalled();
	expect(getGoogleSheetsClient).not.toHaveBeenCalled();
}

describe('a gate that says no means the real handler does nothing', () => {
	beforeEach(() => {
		[mockCollection, mockTopLevelDoc, mockBatch, mockRunTransaction, mockWhere, mockWrite].forEach(
			(mock) => mock.mockReset(),
		);
		refuseFirestore();
	});

	it('tests every route on at least one skipped write', () => {
		const covered = new Set(skippedPairs.map(({ routeName }) => routeName));

		expect([...covered].sort()).toEqual(STATEMENT_ROUTES.map(({ name }) => name).sort());
	});

	it.each(skippedPairs)('$routeName skips "$label"', async ({ statementRoute, scenario }) => {
		const readsFirst = READS_SETTINGS_BEFORE_SCORE_CHECK.includes(statementRoute.name);
		if (readsFirst) allowSettingsReads();
		const event = buildEvent(scenario.before, scenario.after);

		await statementRoute.invoke(event);

		expectNoWrites(event);
		if (!readsFirst) expect(mockCollection).not.toHaveBeenCalled();
	});

	it('sees work when a gate says yes, so the checks above are not empty', async () => {
		const rating = SCENARIOS[0];
		const queueRoute = STATEMENT_ROUTES.find(({ name }) => name === 'fn_updateQueueConsensus');
		if (!queueRoute) throw new Error('route missing');

		expect(routeMatches(queueRoute, toChange(rating))).toBe(true);
		await queueRoute.invoke(buildEvent(rating.before, rating.after));

		expect(mockCollection).toHaveBeenCalled();
	});

	it('acts on a real crossing under the same settings, so the settings are live', async () => {
		allowSettingsReads();
		mockWhere.mockImplementation(() => {
			throw new Error('reached the post-crossing query');
		});
		const autoAdd = STATEMENT_ROUTES.find(({ name }) => name === 'fn_autoAddParagraph');
		if (!autoAdd) throw new Error('route missing');
		const option = { ...SCENARIOS[0].before };

		await autoAdd.invoke(buildEvent(option, { ...option, consensus: 0.9, totalEvaluators: 4 }));
		// Before: 0.1 is under the 0.15 addition threshold; after: 0.9 is over it.

		expect(mockWhere).toHaveBeenCalled();
	});
});
