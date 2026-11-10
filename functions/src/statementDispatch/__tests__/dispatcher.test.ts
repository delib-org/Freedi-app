import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../deliberation/functions', () => ({ queueDeliberation: { run: jest.fn() } }));
jest.mock('../../engagement/joinForm/fn_syncOptionMembersToSheet', () => ({
	fn_syncOptionMembersToSheet: { run: jest.fn() },
}));
jest.mock('../../engagement/joinForm/fn_backupJoinRegistration', () => ({
	fn_backupOptionMembership: { run: jest.fn() },
}));
jest.mock('../../condensation/fn_runCondensation', () => ({
	onStatementCreatedMarkCondensationStale: { run: jest.fn() },
}));
jest.mock('../../fn_syncParagraphChildrenToDescription', () => ({
	fn_syncParagraphChildrenToDescription: { run: jest.fn() },
}));
jest.mock('../../fn_pruneVersionHistory', () => ({ fn_pruneVersionHistory: { run: jest.fn() } }));
jest.mock('../../fn_consensusActions', () => ({
	fn_autoAddParagraph: { run: jest.fn() },
	fn_autoRemoveParagraph: { run: jest.fn() },
}));
jest.mock('../../fn_createReplacementQueueItem', () => ({
	fn_createReplacementQueueItem: { run: jest.fn() },
}));
jest.mock('../../fn_updateQueueConsensus', () => ({ fn_updateQueueConsensus: { run: jest.fn() } }));
jest.mock('../../fn_massConsensus', () => ({ updateOptionInMassConsensus: jest.fn() }));
jest.mock('../../organizations/studio/mirrorQuestionStatusToSurvey', () => ({
	mirrorQuestionStatusToSurvey: { run: jest.fn() },
}));
jest.mock('../../fn_popperHebbian_onVote', () => ({ onVoteUpdate: { run: jest.fn() } }));
jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));

import { queueDeliberation } from '../../deliberation/functions';
import { fn_syncOptionMembersToSheet } from '../../engagement/joinForm/fn_syncOptionMembersToSheet';
import { fn_backupOptionMembership } from '../../engagement/joinForm/fn_backupJoinRegistration';
import { onStatementCreatedMarkCondensationStale } from '../../condensation/fn_runCondensation';
import { fn_syncParagraphChildrenToDescription } from '../../fn_syncParagraphChildrenToDescription';
import { fn_pruneVersionHistory } from '../../fn_pruneVersionHistory';
import { fn_autoAddParagraph, fn_autoRemoveParagraph } from '../../fn_consensusActions';
import { fn_createReplacementQueueItem } from '../../fn_createReplacementQueueItem';
import { fn_updateQueueConsensus } from '../../fn_updateQueueConsensus';
import { updateOptionInMassConsensus } from '../../fn_massConsensus';
import { mirrorQuestionStatusToSurvey } from '../../organizations/studio/mirrorQuestionStatusToSurvey';
import { onVoteUpdate } from '../../fn_popperHebbian_onVote';
import { logError } from '../../utils/errorHandling';
import { CUTOVER_NOT_SET, MIN_PLAUSIBLE_CUTOVER_MS } from '../cutover';
import { dispatchStatementWrite } from '../onStatementWriteDispatch';
import { STATEMENT_ROUTES } from '../routes';
import { buildEvent, COMMIT_MS, SCENARIOS, STATEMENT_ID } from './statementWriteFixtures';

type RunMock = jest.Mock<(event: unknown) => unknown>;

const asRun = (handler: unknown): RunMock => (handler as { run: RunMock }).run;

const HANDLERS: Record<string, RunMock> = {
	queueDeliberation: asRun(queueDeliberation),
	fn_syncOptionMembersToSheet: asRun(fn_syncOptionMembersToSheet),
	fn_backupOptionMembership: asRun(fn_backupOptionMembership),
	onStatementCreatedMarkCondensationStale: asRun(onStatementCreatedMarkCondensationStale),
	fn_syncParagraphChildrenToDescription: asRun(fn_syncParagraphChildrenToDescription),
	fn_pruneVersionHistory: asRun(fn_pruneVersionHistory),
	fn_autoRemoveParagraph: asRun(fn_autoRemoveParagraph),
	fn_autoAddParagraph: asRun(fn_autoAddParagraph),
	fn_createReplacementQueueItem: asRun(fn_createReplacementQueueItem),
	fn_updateQueueConsensus: asRun(fn_updateQueueConsensus),
	updateOptionInMassConsensus: updateOptionInMassConsensus as unknown as RunMock,
	mirrorQuestionStatusToSurvey: asRun(mirrorQuestionStatusToSurvey),
	onVoteUpdate: asRun(onVoteUpdate),
};

const CUTOVER_PASSED = COMMIT_MS - 1;

function handlersThatRan(): string[] {
	return Object.keys(HANDLERS).filter((name) => HANDLERS[name].mock.calls.length > 0);
}

describe('dispatchStatementWrite', () => {
	beforeEach(() => {
		Object.values(HANDLERS).forEach((handler) => handler.mockReset());
	});

	it('routes every moved handler', () => {
		expect(STATEMENT_ROUTES.map(({ name }) => name).sort()).toEqual(Object.keys(HANDLERS).sort());
	});

	it.each(SCENARIOS)('$label reaches exactly its handlers, once each', async (scenario) => {
		await dispatchStatementWrite(
			buildEvent(scenario.before, scenario.after),
			STATEMENT_ROUTES,
			CUTOVER_PASSED,
		);

		expect(handlersThatRan().sort()).toEqual([...scenario.expected].sort());
		for (const name of scenario.expected) {
			expect(HANDLERS[name]).toHaveBeenCalledTimes(1);
		}
	});

	it.each([
		['queueDeliberation', 'id'],
		['fn_pruneVersionHistory', 'paragraphId'],
		['fn_autoRemoveParagraph', 'paragraphId'],
		['fn_autoAddParagraph', 'suggestionId'],
		['fn_createReplacementQueueItem', 'suggestionId'],
		['fn_updateQueueConsensus', 'suggestionId'],
	])('gives %s the document id as params.%s', async (name, paramName) => {
		const statementRoute = STATEMENT_ROUTES.find((candidate) => candidate.name === name);
		const event = buildEvent({ a: 1 }, { a: 2 });

		await statementRoute?.invoke(event);

		const received = HANDLERS[name].mock.calls[0][0] as { params: Record<string, string> };
		expect(received.params).toEqual({ [paramName]: STATEMENT_ID });
	});

	it('hands the handler the original snapshots and event time', async () => {
		const event = buildEvent({ a: 1 }, { a: 2 });

		await STATEMENT_ROUTES[0].invoke(event);

		const received = HANDLERS[STATEMENT_ROUTES[0].name].mock.calls[0][0] as typeof event;
		expect(received.data).toBe(event.data);
		expect(received.time).toBe(event.time);
	});

	it('does not let one failing handler stop the others', async () => {
		const failure = new Error('sheet down');
		HANDLERS.fn_syncOptionMembersToSheet.mockRejectedValue(failure as never);
		const scenario = SCENARIOS.find(({ label }) => label === 'someone joining an answer');

		await expect(
			dispatchStatementWrite(
				buildEvent(scenario?.before, scenario?.after),
				STATEMENT_ROUTES,
				CUTOVER_PASSED,
			),
		).resolves.toBeUndefined();

		expect(HANDLERS.fn_backupOptionMembership).toHaveBeenCalledTimes(1);
		expect(HANDLERS.queueDeliberation).toHaveBeenCalledTimes(1);
		expect(logError).toHaveBeenCalledTimes(1);
		expect(logError).toHaveBeenCalledWith(failure, {
			operation: 'statementDispatch.fn_syncOptionMembersToSheet',
			statementId: STATEMENT_ID,
			metadata: { kind: 'update' },
		});
	});

	it('logs a handler that throws synchronously', async () => {
		HANDLERS.fn_backupOptionMembership.mockImplementation(() => {
			throw new Error('sync failure');
		});
		const scenario = SCENARIOS.find(({ label }) => label === 'someone joining an answer');

		await dispatchStatementWrite(
			buildEvent(scenario?.before, scenario?.after),
			STATEMENT_ROUTES,
			CUTOVER_PASSED,
		);

		expect(HANDLERS.fn_syncOptionMembersToSheet).toHaveBeenCalledTimes(1);
		expect(logError).toHaveBeenCalledTimes(1);
	});

	it('treats a throwing gate as a match and still evaluates the other routes', async () => {
		const option = SCENARIOS.find(({ label }) => label === 'an answer text edit')?.before;

		await dispatchStatementWrite(
			buildEvent(option, { ...option, joined: 42, lastUpdate: 2 }),
			STATEMENT_ROUTES,
			CUTOVER_PASSED,
		);

		expect(HANDLERS.fn_syncOptionMembersToSheet).toHaveBeenCalledTimes(1);
		expect(HANDLERS.fn_backupOptionMembership).toHaveBeenCalledTimes(1);
		expect(HANDLERS.queueDeliberation).toHaveBeenCalledTimes(1);
		expect(handlersThatRan()).toHaveLength(3);
		expect(logError).toHaveBeenCalledTimes(2);
		expect(logError).toHaveBeenCalledWith(expect.any(TypeError), {
			operation: 'statementDispatch.gate.fn_syncOptionMembersToSheet',
			statementId: STATEMENT_ID,
			metadata: { kind: 'update' },
		});
	});

	it('keeps the deploy check list in step with the routes and the floor', () => {
		const config = JSON.parse(
			readFileSync(
				join(__dirname, '../../../../scripts/scale/dispatchCutover.config.json'),
				'utf8',
			),
		) as { functions: string[]; minPlausibleCutoverMs: number };

		expect([...config.functions].sort()).toEqual(
			[...STATEMENT_ROUTES.map(({ name }) => name), 'onStatementWriteDispatch'].sort(),
		);
		expect(config.minPlausibleCutoverMs).toBe(MIN_PLAUSIBLE_CUTOVER_MS);
	});

	it('runs nothing while the cutover is not set', async () => {
		const scenario = SCENARIOS[0];

		await dispatchStatementWrite(
			buildEvent(scenario.before, scenario.after),
			STATEMENT_ROUTES,
			CUTOVER_NOT_SET,
		);

		expect(handlersThatRan()).toEqual([]);
	});

	it('runs nothing for a write committed before the cutover', async () => {
		const scenario = SCENARIOS[0];

		await dispatchStatementWrite(
			buildEvent(scenario.before, scenario.after),
			STATEMENT_ROUTES,
			COMMIT_MS + 1,
		);

		expect(handlersThatRan()).toEqual([]);
	});

	it('ignores an event with no document on either side', async () => {
		await dispatchStatementWrite(
			buildEvent(undefined, undefined),
			STATEMENT_ROUTES,
			CUTOVER_PASSED,
		);

		expect(handlersThatRan()).toEqual([]);
	});
});
