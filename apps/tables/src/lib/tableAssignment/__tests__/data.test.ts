import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
	collection: vi.fn((_db: unknown, name: string) => ({ name })),
	doc: vi.fn(),
	getDocs: vi.fn(),
	query: vi.fn((...parts: unknown[]) => parts),
	where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
}));

vi.mock('firebase/firestore', () => firestore);
vi.mock('@/lib/firebase', () => ({ db: {} }));
const listeners = vi.hoisted(() => ({ resilientDoc: vi.fn(), resilientQuery: vi.fn() }));

vi.mock('@/lib/listeners', () => listeners);

import { fetchChosenOptions, subscribeRoster, subscribeTablemates } from '../data';

type ErrorHandler = (error: { code: string }) => void;

/** The error handler and options the subscription handed to the listener. */
function listenerCall(): { onError: ErrorHandler; options: unknown } {
	const { calls } = listeners.resilientQuery.mock;
	const [, , , onError, options] = calls[calls.length - 1];

	return { onError: onError as ErrorHandler, options };
}

describe('name cards', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ends the tablemates list quietly when the person is no longer registered', () => {
		const onData = vi.fn();
		const onError = vi.fn();

		subscribeTablemates('session-1')(onData, onError);
		listenerCall().onError({ code: 'permission-denied' });

		expect(listenerCall().options).toEqual({ deniedIsFinal: true });
		expect(onData).toHaveBeenCalledWith([]);
		expect(onError).not.toHaveBeenCalled();
	});

	it('reports any other failure of the tablemates list', () => {
		const onData = vi.fn();
		const onError = vi.fn();

		subscribeTablemates('session-1')(onData, onError);
		listenerCall().onError({ code: 'unavailable' });

		expect(onData).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledWith({ code: 'unavailable' });
	});

	it('reports a refusal to the host: the host list must never go quiet', () => {
		const onError = vi.fn();

		subscribeRoster('session-1')(vi.fn(), onError);
		listenerCall().onError({ code: 'permission-denied' });

		expect(listenerCall().options).toBeUndefined();
		expect(onError).toHaveBeenCalledWith({ code: 'permission-denied' });
	});
});

describe('fetchChosenOptions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('filters the question children by the isChosen flag the server writes', async () => {
		firestore.getDocs.mockResolvedValue({ docs: [] });

		await fetchChosenOptions('question-1');

		expect(firestore.where).toHaveBeenCalledWith('parentId', '==', 'question-1');
		expect(firestore.where).toHaveBeenCalledWith('isChosen', '==', true);
		expect(firestore.where).toHaveBeenCalledWith('statementType', '==', 'option');
		expect(firestore.where).toHaveBeenCalledTimes(3);
	});

	it('returns the statement data of every matching document', async () => {
		const option = { statementId: 'option-1', isChosen: true };
		firestore.getDocs.mockResolvedValue({ docs: [{ data: () => option }] });

		await expect(fetchChosenOptions('question-1')).resolves.toEqual([option]);
	});

	it('rejects when the read is not permitted', async () => {
		firestore.getDocs.mockRejectedValue(new Error('permission-denied'));

		await expect(fetchChosenOptions('question-1')).rejects.toThrow('permission-denied');
	});
});
