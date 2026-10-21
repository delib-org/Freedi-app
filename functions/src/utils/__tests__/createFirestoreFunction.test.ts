import { createFirestoreFunction, HOT_TRIGGER_MEMORY } from '../createFirestoreFunction';

jest.mock('../errorHandling', () => ({ logError: jest.fn() }));

interface TriggerOptions {
	document: string;
	region: string;
	memory?: string;
}

type TriggerHandler = (event: { id: string }) => Promise<void>;

describe('createFirestoreFunction', () => {
	const makeTrigger = (): jest.Mock =>
		jest.fn((_opts: TriggerOptions, _handler: TriggerHandler) => 'cloud-function');
	const asTrigger = (mock: jest.Mock): Parameters<typeof createFirestoreFunction>[1] =>
		mock as unknown as Parameters<typeof createFirestoreFunction>[1];

	beforeEach(() => {
		jest.spyOn(console, 'info').mockImplementation(() => undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('uses 512MiB for hot triggers', () => {
		expect(HOT_TRIGGER_MEMORY).toBe('512MiB');
	});

	it('passes the memory option through to the trigger', () => {
		const trigger = makeTrigger();

		createFirestoreFunction('/evaluations/{id}', asTrigger(trigger), async () => undefined, 'x', {
			memory: HOT_TRIGGER_MEMORY,
		});

		const opts = trigger.mock.calls[0][0] as TriggerOptions;
		expect(opts.memory).toBe('512MiB');
		expect(opts.document).toBe('/evaluations/{id}');
		expect(opts.region).toBe('me-west1');
	});

	it('leaves memory unset when no options are given (current behavior)', () => {
		const trigger = makeTrigger();

		createFirestoreFunction('/evaluations/{id}', asTrigger(trigger), async () => undefined, 'x');

		const opts = trigger.mock.calls[0][0] as TriggerOptions;
		expect('memory' in opts).toBe(false);
		expect(opts.region).toBe('me-west1');
	});

	it('runs the callback and rethrows its errors', async () => {
		const trigger = makeTrigger();
		const failure = new Error('boom');
		const callback = jest.fn().mockRejectedValue(failure);

		createFirestoreFunction('/a/{id}', asTrigger(trigger), callback, 'x');
		const handler = trigger.mock.calls[0][1] as TriggerHandler;

		await expect(handler({ id: '1' })).rejects.toBe(failure);
		expect(callback).toHaveBeenCalledWith({ id: '1' });
	});
});
