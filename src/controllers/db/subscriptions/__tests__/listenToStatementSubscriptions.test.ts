import { listenToStatementSubscriptions } from '../getSubscriptions';

const mockFirstLoad = jest.fn();
const mockHasListener = jest.fn();
const mockManaged = jest.fn();

jest.mock('firebase/firestore', () => ({
	collection: jest.fn(),
	doc: jest.fn(),
	or: jest.fn(),
	and: jest.fn(),
	getDoc: jest.fn(),
	getDocs: jest.fn(),
	limit: jest.fn(),
	onSnapshot: jest.fn(),
	orderBy: jest.fn(),
	query: jest.fn(() => ({})),
	startAfter: jest.fn(),
	where: jest.fn(),
}));
jest.mock('../../config', () => ({ FireStore: {} }));
jest.mock('../../statements/getStatement', () => ({ getStatementFromDB: jest.fn() }));
jest.mock('@/controllers/general/helpers', () => ({ getStatementSubscriptionId: jest.fn() }));
jest.mock('@/redux/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('@/controllers/utils/ListenerManager', () => ({
	listenerManager: { hasListener: (k: string) => mockHasListener(k) },
}));
jest.mock('@/controllers/utils/firstLoadThenListen', () => ({
	firstLoadThenListen: (o: unknown) => mockFirstLoad(o),
}));
jest.mock('@/controllers/utils/firestoreListenerHelpers', () => ({
	generateListenerKey: () => 'key-1',
	createManagedCollectionListener: (...a: unknown[]) => mockManaged(...a),
}));

describe('listenToStatementSubscriptions first load', () => {
	const cancel = jest.fn();
	const unsubscribe = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		mockHasListener.mockReturnValue(false);
		mockManaged.mockReturnValue(unsubscribe);
		mockFirstLoad.mockReturnValue({ onNext: jest.fn(), cancel });
	});

	it('starts the head start read for a new listener and wires its onNext', () => {
		listenToStatementSubscriptions('u1', 30);

		expect(mockFirstLoad).toHaveBeenCalledTimes(1);
		const handle = mockFirstLoad.mock.results[0].value;
		expect(mockManaged.mock.calls[0][2]).toBe(handle.onNext);
	});

	it('skips the head start when the listener key is already registered', () => {
		mockHasListener.mockReturnValue(true);
		listenToStatementSubscriptions('u1', 30);

		expect(mockFirstLoad).not.toHaveBeenCalled();
	});

	it('skips the head start when the live limit is 10 or less', () => {
		listenToStatementSubscriptions('u1', 10);

		expect(mockFirstLoad).not.toHaveBeenCalled();
	});

	it('unsubscribe cancels the head start and the live listener', () => {
		const stop = listenToStatementSubscriptions('u1', 30);
		stop();

		expect(cancel).toHaveBeenCalledTimes(1);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});
});
