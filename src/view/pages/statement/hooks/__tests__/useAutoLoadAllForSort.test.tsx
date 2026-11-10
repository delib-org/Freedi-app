import { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { SortType } from '@freedi/shared-types';
import statements from '@/redux/statements/statementsSlice';
import { bulkLoadStatements, BulkLoadResult } from '@/controllers/db/statements/bulkLoadStatements';
import { logError } from '@/utils/errorHandling';
import { useAutoLoadAllForSort } from '../useAutoLoadAllForSort';

jest.mock('@/controllers/db/statements/bulkLoadStatements', () => ({
	bulkLoadStatements: jest.fn(),
}));
jest.mock('@/utils/errorHandling', () => ({
	...jest.requireActual('@/utils/errorHandling'),
	logError: jest.fn(),
}));

interface Deferred {
	resolve: (result: BulkLoadResult) => void;
	reject: (error: Error) => void;
}

interface HookProps {
	statementId: string | undefined;
	sort: string | undefined;
}

const QUESTION_ID = 'q1';
const OTHER_QUESTION_ID = 'q2';
const RESULT: BulkLoadResult = { loaded: 3, watermark: 1 };

function deferNextLoad(): Deferred {
	let deferred: Deferred | undefined;
	const promise = new Promise<BulkLoadResult>((resolve, reject) => {
		deferred = { resolve, reject };
	});
	(bulkLoadStatements as jest.Mock).mockReturnValueOnce(promise);

	return deferred as Deferred;
}

function renderLoader(initialProps: HookProps) {
	const store = configureStore({ reducer: { statements } });
	const wrapper = ({ children }: { children: ReactNode }) => (
		<Provider store={store}>{children}</Provider>
	);

	return renderHook(
		({ statementId, sort }: HookProps) => useAutoLoadAllForSort(statementId, sort),
		{ initialProps, wrapper },
	);
}

describe('useAutoLoadAllForSort', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('stops loading once the load has marked the scope as fully loaded', async () => {
		const load = deferNextLoad();
		const { result } = renderLoader({ statementId: QUESTION_ID, sort: SortType.accepted });
		expect(result.current.isAutoLoading).toBe(true);

		await act(async () => {
			load.resolve(RESULT);
		});

		expect(result.current.isAutoLoading).toBe(false);
		expect(bulkLoadStatements).toHaveBeenCalledTimes(1);
	});

	it('stops loading and logs when the load fails, without retrying', async () => {
		const load = deferNextLoad();
		const { result } = renderLoader({ statementId: QUESTION_ID, sort: SortType.accepted });

		await act(async () => {
			load.reject(new Error('boom'));
		});

		expect(result.current.isAutoLoading).toBe(false);
		expect(logError).toHaveBeenCalledTimes(1);
		expect(bulkLoadStatements).toHaveBeenCalledTimes(1);
	});

	it('stops loading when the sort leaves the ranked sorts during the load', async () => {
		const load = deferNextLoad();
		const { result, rerender } = renderLoader({
			statementId: QUESTION_ID,
			sort: SortType.accepted,
		});

		rerender({ statementId: QUESTION_ID, sort: SortType.newest });
		await act(async () => {
			load.resolve(RESULT);
		});

		expect(result.current.isAutoLoading).toBe(false);
	});

	it('stops loading when the sort moves to another ranked sort during the load', async () => {
		const load = deferNextLoad();
		const { result, rerender } = renderLoader({
			statementId: QUESTION_ID,
			sort: SortType.accepted,
		});

		rerender({ statementId: QUESTION_ID, sort: SortType.mostJoined });
		await act(async () => {
			load.resolve(RESULT);
		});

		expect(result.current.isAutoLoading).toBe(false);
		expect(bulkLoadStatements).toHaveBeenCalledTimes(1);
	});

	it('loads the new question when the question changes during a load', async () => {
		const firstLoad = deferNextLoad();
		const secondLoad = deferNextLoad();
		const { result, rerender } = renderLoader({
			statementId: QUESTION_ID,
			sort: SortType.accepted,
		});

		rerender({ statementId: OTHER_QUESTION_ID, sort: SortType.accepted });
		expect(bulkLoadStatements).toHaveBeenLastCalledWith(OTHER_QUESTION_ID, 'direct');

		await act(async () => {
			firstLoad.resolve(RESULT);
		});
		expect(result.current.isAutoLoading).toBe(true);

		await act(async () => {
			secondLoad.resolve(RESULT);
		});
		expect(result.current.isAutoLoading).toBe(false);
	});

	it('does not load for a chronological sort or without a statement', () => {
		const { result, rerender } = renderLoader({ statementId: QUESTION_ID, sort: SortType.newest });
		rerender({ statementId: undefined, sort: SortType.accepted });

		expect(result.current.isAutoLoading).toBe(false);
		expect(bulkLoadStatements).not.toHaveBeenCalled();
	});
});
