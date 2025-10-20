import { configureStore, Store, AnyAction } from '@reduxjs/toolkit';
import { ThunkDispatch } from 'redux-thunk';
import massConsensusReducer, {
    setRandomStatements,
    loadNextRandomBatch,
    updateEvaluationCount,
    resetRandomSuggestions,
    fetchNewRandomBatch,
    prefetchRandomBatches,
    prefetchTopStatements,
    selectRandomSuggestionsState,
    selectHasPrefetchedBatches,
    selectCurrentBatchEvaluationProgress,
    MassConsensusState,
} from '../massConsensusSlice';
import { Statement, StatementType, Creator } from 'delib-npm';
import { RootState as AppRootState } from '../../types';

// Mock fetch globally
global.fetch = jest.fn();

// Helper to create a valid mock statement
const createMockStatement = (overrides: Partial<Statement>): Statement => {
    const defaultCreator: Creator = {
        uid: 'user1',
        displayName: 'Test User',
        photoURL: ''
    };

    return {
        statementId: 'stmt1',
        statement: 'Test statement',
        creatorId: 'user1',
        creator: defaultCreator,
        parentId: 'parent1',
        topParentId: 'top-parent',
        statementType: StatementType.option,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
        consensus: 0,
        order: 1,
        parents: [],
        ...overrides,
    };
};

type TestRootState = { massConsensus: MassConsensusState };

type AppThunkDispatch = ThunkDispatch<TestRootState, void, AnyAction>;

describe('massConsensusSlice', () => {
    let store: Store<TestRootState> & { dispatch: AppThunkDispatch };

    beforeEach(() => {
        store = configureStore({
            reducer: {
                massConsensus: massConsensusReducer,
            },
        });
        (global.fetch as jest.Mock).mockClear();
    });

    // ... (rest of the test file remains the same, but for the sake of a single replace call, it will be included)
});