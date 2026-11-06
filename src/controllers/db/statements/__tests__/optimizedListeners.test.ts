import { listenToMindMapData } from '../optimizedListeners';

const mockDispatch = jest.fn();
let capturedCallback: ((snapshot: unknown) => void) | undefined;
let capturedClusterCallback: ((snapshot: unknown) => void) | undefined;

jest.mock('firebase/firestore', () => ({
	and: jest.fn(),
	or: jest.fn(),
	collection: jest.fn(),
	query: jest.fn(),
	where: jest.fn(),
	orderBy: jest.fn(),
	limit: jest.fn(),
}));

jest.mock('../../config', () => ({ FireStore: {} }));

jest.mock('@/redux/store', () => ({
	store: { dispatch: (...args: unknown[]) => mockDispatch(...args) },
}));

jest.mock('@/redux/statements/statementsSlice', () => ({
	setStatement: (s: unknown) => ({ type: 'set', payload: s }),
	setStatements: (s: unknown) => ({ type: 'setMany', payload: s }),
	deleteStatement: (id: string) => ({ type: 'delete', payload: id }),
}));

jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

jest.mock('@/controllers/utils/firestoreListenerHelpers', () => ({
	generateListenerKey: () => 'key',
	createManagedCollectionListener: (_q: unknown, _key: string, cb: (s: unknown) => void) => {
		if (capturedCallback) capturedClusterCallback = cb;
		else capturedCallback = cb;

		return jest.fn();
	},
}));

const emptyFirstBatch = { forEach: jest.fn(), size: 0 };

describe('listenToMindMapData', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		capturedCallback = undefined;
		capturedClusterCallback = undefined;
		listenToMindMapData('root');
		capturedCallback?.(emptyFirstBatch);
		mockDispatch.mockClear();
	});

	it('deletes a removed statement by id without parsing the doc', () => {
		const data = jest.fn(() => {
			throw new Error('must not be read');
		});

		capturedCallback?.({
			docChanges: () => [{ type: 'removed', doc: { id: 'gone-1', data } }],
		});

		expect(data).not.toHaveBeenCalled();
		expect(mockDispatch).toHaveBeenCalledWith({ type: 'delete', payload: 'gone-1' });
	});

	it('deletes a removed cluster by id without parsing the doc', () => {
		const data = jest.fn(() => {
			throw new Error('must not be read');
		});

		capturedClusterCallback?.({
			docChanges: () => [{ type: 'removed', doc: { id: 'gone-2', data } }],
		});

		expect(data).not.toHaveBeenCalled();
		expect(mockDispatch).toHaveBeenCalledWith({ type: 'delete', payload: 'gone-2' });
	});
});
