import { Statement, StatementType } from '@freedi/shared-types';
import { FIREBASE } from '@/constants/common';
import { listenToBatchAnswers, storeSideLoadedAnswers } from '../answerBatch';

const mockDispatch = jest.fn();
let mockState: {
	statements: { statements: Statement[] };
	answerViews: { sideLoadedIds: Record<string, true> };
};
const mockListen = jest.fn();

jest.mock('../../config', () => ({ functions: {} }));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('firebase/firestore', () => ({
	documentId: () => '__name__',
	query: (_ref: unknown, ...constraints: unknown[]) => constraints,
	where: (field: string, op: string, value: unknown) => ({ field, op, value }),
}));
jest.mock('@/redux/store', () => ({
	store: { dispatch: (action: unknown) => mockDispatch(action), getState: () => mockState },
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	setStatements: (statements: Statement[]) => ({ type: 'set-many', statements }),
	setStatement: (statement: Statement) => ({ type: 'set', statement }),
	deleteStatement: (id: string) => ({ type: 'delete', id }),
}));
jest.mock('@/redux/answerViews/answerViewsSlice', () => ({
	markSideLoaded: (ids: string[]) => ({ type: 'mark', ids }),
}));
jest.mock('@/utils/firebaseUtils', () => ({ createCollectionRef: () => 'statements' }));
jest.mock('@/helpers/timestampHelpers', () => ({ normalizeStatementData: (raw: unknown) => raw }));
jest.mock('valibot', () => ({
	...jest.requireActual('valibot'),
	parse: (_schema: unknown, value: unknown) => value,
}));
jest.mock('@/controllers/utils/firestoreListenerHelpers', () => ({
	generateListenerKey: (...parts: string[]) => parts.join(':'),
	createManagedCollectionListener: (...args: unknown[]) => mockListen(...args),
}));

function answer(id: string, lastUpdate = 1): Statement {
	return { statementId: id, statementType: StatementType.option, lastUpdate } as Statement;
}

describe('storeSideLoadedAnswers', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockState = { statements: { statements: [] }, answerViews: { sideLoadedIds: {} } };
	});

	it('adds an answer the store does not hold', () => {
		storeSideLoadedAnswers([answer('a')]);

		expect(mockDispatch).toHaveBeenCalledWith({ type: 'mark', ids: ['a'] });
	});

	it('leaves a copy the window keeps live', () => {
		mockState.statements.statements = [answer('a')];

		storeSideLoadedAnswers([answer('a', 9)]);

		expect(mockDispatch).not.toHaveBeenCalled();
	});

	it('updates a side-loaded copy, which has no listener', () => {
		mockState.statements.statements = [answer('a')];
		mockState.answerViews.sideLoadedIds = { a: true };

		storeSideLoadedAnswers([answer('a', 9)]);

		expect(mockDispatch).toHaveBeenCalledWith({ type: 'set-many', statements: [answer('a', 9)] });
	});

	it('does not replace a side-loaded copy with an older fetch', () => {
		mockState.statements.statements = [answer('a', 9)];
		mockState.answerViews.sideLoadedIds = { a: true };

		storeSideLoadedAnswers([answer('a', 1)]);

		expect(mockDispatch).not.toHaveBeenCalled();
	});
});

describe('listenToBatchAnswers', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockListen.mockReturnValue(jest.fn());
	});

	it('splits ids into chunks under the limit of an in-query', () => {
		const ids = Array.from({ length: FIREBASE.IN_QUERY_LIMIT + 2 }, (_, index) => `a${index}`);

		listenToBatchAnswers('q', ids);

		expect(mockListen).toHaveBeenCalledTimes(2);
		expect(mockListen.mock.calls[0][0][0].value).toHaveLength(FIREBASE.IN_QUERY_LIMIT);
		expect(mockListen.mock.calls[1][0][0].value).toHaveLength(2);
	});

	it('stops every chunk', () => {
		const stop = jest.fn();
		mockListen.mockReturnValue(stop);
		const unsubscribe = listenToBatchAnswers('q', ['a', 'b']);

		unsubscribe();

		expect(stop).toHaveBeenCalledTimes(1);
	});

	it('applies an edit and removes a deleted answer', () => {
		listenToBatchAnswers('q', ['a']);
		const onNext = mockListen.mock.calls[0][2];

		onNext({
			docChanges: () => [
				{ type: 'modified', doc: { id: 'a', data: () => answer('a', 5) } },
				{ type: 'removed', doc: { id: 'b', data: () => answer('b') } },
			],
		});

		expect(mockDispatch).toHaveBeenCalledWith({ type: 'set', statement: answer('a', 5) });
		expect(mockDispatch).toHaveBeenCalledWith({ type: 'delete', id: 'b' });
	});
});
