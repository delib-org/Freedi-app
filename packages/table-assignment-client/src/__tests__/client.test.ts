import { httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import { createTablesClient, TABLES_CALLABLES } from '../client';
import type { TablesClient } from '../client';

jest.mock('firebase/functions', () => ({
	httpsCallable: jest.fn(),
}));

const mockedHttpsCallable = httpsCallable as jest.Mock;
const functionsStub = { region: 'me-west1' } as unknown as Functions;

const WRAPPERS: ReadonlyArray<[keyof TablesClient, string]> = [
	['createSession', TABLES_CALLABLES.createSession],
	['saveTopics', TABLES_CALLABLES.saveTopics],
	['saveSettings', TABLES_CALLABLES.saveSettings],
	['setStatus', TABLES_CALLABLES.setStatus],
	['register', TABLES_CALLABLES.register],
	['savePreferences', TABLES_CALLABLES.savePreferences],
	['joinTable', TABLES_CALLABLES.joinTable],
	['computePreview', TABLES_CALLABLES.computePreview],
	['publishRun', TABLES_CALLABLES.publishRun],
	['cancelRegistration', TABLES_CALLABLES.cancelRegistration],
	['removeParticipant', TABLES_CALLABLES.removeParticipant],
	['fixDetails', TABLES_CALLABLES.fixDetails],
	['deleteSession', TABLES_CALLABLES.deleteSession],
];

describe('createTablesClient', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('covers all thirteen callables with their deployed names', () => {
		expect(Object.values(TABLES_CALLABLES).sort()).toEqual(
			[
				'tablesCancelRegistration',
				'tablesComputePreview',
				'tablesCreateSession',
				'tablesDeleteSession',
				'tablesFixDetails',
				'tablesJoinTable',
				'tablesPublishRun',
				'tablesRegister',
				'tablesRemoveParticipant',
				'tablesSavePreferences',
				'tablesSaveSettings',
				'tablesSaveTopics',
				'tablesSetStatus',
			].sort(),
		);
	});

	it.each(WRAPPERS)('%s calls %s, passes the request and returns data', async (method, name) => {
		const callable = jest.fn().mockResolvedValue({ data: { ok: method } });

		mockedHttpsCallable.mockReturnValue(callable);

		const client = createTablesClient(functionsStub);
		const request = { sessionId: 's1' };
		const result = await (client[method] as (r: unknown) => Promise<unknown>)(request);

		expect(mockedHttpsCallable).toHaveBeenCalledWith(functionsStub, name);
		expect(callable).toHaveBeenCalledWith(request);
		expect(result).toEqual({ ok: method });
	});

	it('rethrows callable errors untouched', async () => {
		const failure = new Error('failed-precondition');

		mockedHttpsCallable.mockReturnValue(jest.fn().mockRejectedValue(failure));

		await expect(
			createTablesClient(functionsStub).joinTable({ sessionId: 's1', tableIndex: 0 }),
		).rejects.toBe(failure);
	});
});
