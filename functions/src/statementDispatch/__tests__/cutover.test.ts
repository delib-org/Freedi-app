import { afterEach, describe, expect, it, jest } from '@jest/globals';

const mockWarn = jest.fn();

jest.mock('firebase-functions', () => ({
	logger: { warn: (message: string) => mockWarn(message) },
}));
jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));

import { logError } from '../../utils/errorHandling';
import {
	CUTOVER_NOT_SET,
	CommitTimedEvent,
	dispatcherOwnsEvent,
	eventCommitMs,
	MIN_PLAUSIBLE_CUTOVER_MS,
	parseCutoverMs,
} from '../cutover';

const CUTOVER_MS = 1_800_000_000_000;
const ENV_KEY = 'STATEMENT_DISPATCH_CUTOVER_MS';

function eventCommittedAt(commitMs: number): CommitTimedEvent {
	return {
		// Deliberately different: the commit time must win over the delivery time.
		time: new Date(commitMs + 5_000).toISOString(),
		data: { after: { updateTime: { toMillis: () => commitMs } } },
	};
}

function loadCutoverWithEnv(value: string | undefined): typeof import('../cutover') {
	if (value === undefined) delete process.env[ENV_KEY];
	else process.env[ENV_KEY] = value;

	let loaded: typeof import('../cutover') | undefined;
	jest.isolateModules(() => {
		loaded = jest.requireActual<typeof import('../cutover')>('../cutover');
	});

	return loaded as typeof import('../cutover');
}

describe('parseCutoverMs', () => {
	it('reads a positive number', () => {
		expect(parseCutoverMs(String(CUTOVER_MS))).toBe(CUTOVER_MS);
	});

	it('accepts the floor itself', () => {
		expect(parseCutoverMs(String(MIN_PLAUSIBLE_CUTOVER_MS))).toBe(MIN_PLAUSIBLE_CUTOVER_MS);
	});

	it('has its floor at 2026-01-01 UTC', () => {
		expect(MIN_PLAUSIBLE_CUTOVER_MS).toBe(Date.UTC(2026, 0, 1));
	});

	it.each([
		undefined,
		'',
		'tomorrow',
		'0',
		'-5',
		'Infinity',
		String(MIN_PLAUSIBLE_CUTOVER_MS - 1),
		String(CUTOVER_MS / 1_000), // the same moment in seconds
	])('treats %s as not set', (raw) => {
		expect(parseCutoverMs(raw)).toBe(CUTOVER_NOT_SET);
	});
});

describe('eventCommitMs', () => {
	it('uses the document commit time when the document exists', () => {
		expect(eventCommitMs(eventCommittedAt(CUTOVER_MS))).toBe(CUTOVER_MS);
	});

	it('falls back to the event time for a delete', () => {
		const time = new Date(CUTOVER_MS).toISOString();

		expect(eventCommitMs({ time, data: { after: {} } })).toBe(CUTOVER_MS);
	});
});

describe('dispatcherOwnsEvent', () => {
	it('gives the dispatcher a write committed exactly at the cutover', () => {
		expect(dispatcherOwnsEvent(eventCommittedAt(CUTOVER_MS), CUTOVER_MS)).toBe(true);
	});

	it('leaves an earlier write with the old triggers', () => {
		expect(dispatcherOwnsEvent(eventCommittedAt(CUTOVER_MS - 1), CUTOVER_MS)).toBe(false);
	});

	it('never gives the dispatcher a write while unset', () => {
		expect(dispatcherOwnsEvent(eventCommittedAt(CUTOVER_MS))).toBe(false);
	});
});

describe('exactly one side handles each write', () => {
	afterEach(() => {
		delete process.env[ENV_KEY];
		delete process.env.K_SERVICE;
		delete process.env.FUNCTIONS_EMULATOR;
	});

	it.each([CUTOVER_MS - 1_000, CUTOVER_MS - 1, CUTOVER_MS, CUTOVER_MS + 1, CUTOVER_MS + 1_000])(
		'a write committed at %d runs once in total',
		async (commitMs) => {
			const cutover = loadCutoverWithEnv(String(CUTOVER_MS));
			const legacyHandler = jest.fn(() => Promise.resolve());
			const event = eventCommittedAt(commitMs);

			await cutover.skipWhenDispatcherOwns(legacyHandler)(event);
			const dispatcherRuns = cutover.dispatcherOwnsEvent(event) ? 1 : 0;

			expect(legacyHandler.mock.calls.length + dispatcherRuns).toBe(1);
		},
	);

	it('keeps every write on the old triggers when unset', async () => {
		const cutover = loadCutoverWithEnv(undefined);
		const legacyHandler = jest.fn(() => Promise.resolve());

		await cutover.skipWhenDispatcherOwns(legacyHandler)(eventCommittedAt(CUTOVER_MS));

		expect(legacyHandler).toHaveBeenCalledTimes(1);
	});

	it('reports a malformed value and stays inert', () => {
		const cutover = loadCutoverWithEnv('not-a-number');

		expect(cutover.STATEMENT_DISPATCH_CUTOVER_MS).toBe(CUTOVER_NOT_SET);
		expect(logError).toHaveBeenCalledTimes(1);
	});

	it('reports a value in seconds and stays inert', () => {
		const cutover = loadCutoverWithEnv(String(CUTOVER_MS / 1_000));

		expect(cutover.dispatcherOwnsEvent(eventCommittedAt(CUTOVER_MS))).toBe(false);
		expect(logError).toHaveBeenCalledTimes(1);
	});

	it('warns once when unset in a deployed function', () => {
		process.env.K_SERVICE = 'onstatementwritedispatch';

		loadCutoverWithEnv(undefined);

		expect(mockWarn).toHaveBeenCalledTimes(1);
		expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining(ENV_KEY));
		expect(logError).not.toHaveBeenCalled();
	});

	it('stays quiet when unset on the emulator', () => {
		process.env.K_SERVICE = 'onstatementwritedispatch';
		process.env.FUNCTIONS_EMULATOR = 'true';

		loadCutoverWithEnv(undefined);

		expect(mockWarn).not.toHaveBeenCalled();
	});

	it('stays quiet when unset outside a deployed function', () => {
		loadCutoverWithEnv(undefined);

		expect(mockWarn).not.toHaveBeenCalled();
	});

	it('does not warn when set in a deployed function', () => {
		process.env.K_SERVICE = 'onstatementwritedispatch';

		loadCutoverWithEnv(String(CUTOVER_MS));

		expect(mockWarn).not.toHaveBeenCalled();
	});
});
