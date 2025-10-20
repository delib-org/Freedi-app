import { configureStore } from '@reduxjs/toolkit';
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
} from '../massConsensusSlice';
import { Statement, StatementType } from 'delib-npm';

// Mock fetch globally
global.fetch = jest.fn();

describe('massConsensusSlice', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        massConsensus: massConsensusReducer,
      },
    });
    jest.clearAllMocks();
  });

  describe('Synchronous Actions', () => {
    describe('setRandomStatements', () => {
      it('should set random statements and mark them as viewed', () => {
        const mockStatements: Statement[] = [
          {
            statementId: 'stmt1',
            statement: 'Test statement 1',
            creatorId: 'user1',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
          {
            statementId: 'stmt2',
            statement: 'Test statement 2',
            creatorId: 'user2',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ];

        store.dispatch(setRandomStatements(mockStatements));
        const state = store.getState().massConsensus;

        expect(state.randomStatements).toEqual(mockStatements);
        expect(state.viewedStatementIds).toContain('stmt1');
        expect(state.viewedStatementIds).toContain('stmt2');
        expect(state.ui.canGetNewSuggestions).toBe(false);
      });
    });

    describe('loadNextRandomBatch', () => {
      it('should load next batch from prefetched batches', () => {
        const currentBatch: Statement[] = [
          {
            statementId: 'current1',
            statement: 'Current statement',
            creatorId: 'user1',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ];

        const nextBatch: Statement[] = [
          {
            statementId: 'next1',
            statement: 'Next statement',
            creatorId: 'user2',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ];

        // Set current batch
        store.dispatch(setRandomStatements(currentBatch));

        // Manually set prefetch batches (simulating prefetch)
        const state = store.getState().massConsensus;
        state.prefetch.randomBatches = [nextBatch];

        // Load next batch
        store.dispatch(loadNextRandomBatch());
        const newState = store.getState().massConsensus;

        expect(newState.randomStatements).toEqual(nextBatch);
        expect(newState.randomStatementsBatches).toContainEqual(currentBatch);
        expect(newState.currentRandomBatch).toBe(1);
        expect(newState.ui.totalBatchesViewed).toBe(2);
      });
    });

    describe('updateEvaluationCount', () => {
      it('should update evaluation count for current batch', () => {
        const mockStatements: Statement[] = [
          {
            statementId: 'stmt1',
            statement: 'Statement 1',
            creatorId: 'user1',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
          {
            statementId: 'stmt2',
            statement: 'Statement 2',
            creatorId: 'user2',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ];

        store.dispatch(setRandomStatements(mockStatements));

        // Evaluate first statement
        store.dispatch(updateEvaluationCount('stmt1'));
        let state = store.getState().massConsensus;
        expect(state.ui.evaluationsPerBatch[0]).toBe(1);
        expect(state.ui.canGetNewSuggestions).toBe(false);

        // Evaluate second statement (all evaluated)
        store.dispatch(updateEvaluationCount('stmt2'));
        state = store.getState().massConsensus;
        expect(state.ui.evaluationsPerBatch[0]).toBe(2);
        expect(state.ui.canGetNewSuggestions).toBe(true);
      });
    });

    describe('resetRandomSuggestions', () => {
      it('should reset all random suggestions state', () => {
        // Set some state first
        const mockStatements: Statement[] = [
          {
            statementId: 'stmt1',
            statement: 'Test statement',
            creatorId: 'user1',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ];

        store.dispatch(setRandomStatements(mockStatements));
        store.dispatch(updateEvaluationCount('stmt1'));

        // Reset
        store.dispatch(resetRandomSuggestions());
        const state = store.getState().massConsensus;

        expect(state.randomStatements).toEqual([]);
        expect(state.randomStatementsBatches).toEqual([]);
        expect(state.currentRandomBatch).toBe(0);
        expect(state.viewedStatementIds).toEqual([]);
        expect(state.ui.evaluationsPerBatch).toEqual({});
        expect(state.ui.canGetNewSuggestions).toBe(false);
        expect(state.ui.totalBatchesViewed).toBe(1);
      });
    });
  });

  describe('Async Thunks', () => {
    describe('fetchNewRandomBatch', () => {
      it('should fetch new batch and exclude viewed statements', async () => {
        const mockStatements: Statement[] = [
          {
            statementId: 'new1',
            statement: 'New statement',
            creatorId: 'user1',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ];

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ statements: mockStatements }),
        });

        // Set some viewed statements first
        store.dispatch(setRandomStatements([
          {
            statementId: 'viewed1',
            statement: 'Already viewed',
            creatorId: 'user1',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ]));

        await store.dispatch(fetchNewRandomBatch('parent1') as any);

        const state = store.getState().massConsensus;
        expect(state.randomStatements).toEqual(mockStatements);
        expect(state.loading.fetchingNewRandom).toBe(false);
        expect(state.errors.randomSuggestions).toBeUndefined();

        // Check that fetch was called with excludeIds
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('excludeIds=viewed1')
        );
      });

      it('should handle fetch errors', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

        await store.dispatch(fetchNewRandomBatch('parent1') as any);

        const state = store.getState().massConsensus;
        expect(state.loading.fetchingNewRandom).toBe(false);
        expect(state.errors.randomSuggestions).toBeDefined();
      });
    });

    describe('prefetchRandomBatches', () => {
      it('should prefetch multiple batches', async () => {
        const mockBatch1: Statement[] = [
          {
            statementId: 'batch1-1',
            statement: 'Batch 1 Statement',
            creatorId: 'user1',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ];

        const mockBatch2: Statement[] = [
          {
            statementId: 'batch2-1',
            statement: 'Batch 2 Statement',
            creatorId: 'user2',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ];

        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ statements: mockBatch1 }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ statements: mockBatch2 }),
          });

        await store.dispatch(
          prefetchRandomBatches({ statementId: 'parent1', batchCount: 2 }) as any
        );

        const state = store.getState().massConsensus;
        expect(state.prefetch.randomBatches).toHaveLength(2);
        expect(state.prefetch.randomBatches[0]).toEqual(mockBatch1);
        expect(state.prefetch.randomBatches[1]).toEqual(mockBatch2);
        expect(state.prefetch.randomBatchesTimestamp).toBeGreaterThan(0);
        expect(state.loading.prefetchingRandom).toBe(false);
      });
    });

    describe('prefetchTopStatements', () => {
      it('should prefetch top statements', async () => {
        const mockTopStatements: Statement[] = [
          {
            statementId: 'top1',
            statement: 'Top statement',
            creatorId: 'user1',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ];

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ statements: mockTopStatements }),
        });

        await store.dispatch(prefetchTopStatements('parent1') as any);

        const state = store.getState().massConsensus;
        expect(state.prefetch.topStatements).toEqual(mockTopStatements);
        expect(state.prefetch.topStatementsTimestamp).toBeGreaterThan(0);
        expect(state.prefetch.topStatementsParentId).toBe('parent1');
        expect(state.loading.prefetchingTop).toBe(false);
      });
    });
  });

  describe('Selectors', () => {
    describe('selectRandomSuggestionsState', () => {
      it('should return complete random suggestions state', () => {
        const mockStatements: Statement[] = [
          {
            statementId: 'stmt1',
            statement: 'Test statement',
            creatorId: 'user1',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ];

        store.dispatch(setRandomStatements(mockStatements));

        const state = selectRandomSuggestionsState(store.getState());

        expect(state.randomStatements).toEqual(mockStatements);
        expect(state.currentBatch).toBe(0);
        expect(state.canGetNewSuggestions).toBe(false);
        expect(state.isLoadingNew).toBe(false);
        expect(state.hasPrefetchedBatches).toBe(false);
        expect(state.totalBatchesViewed).toBe(1);
      });
    });

    describe('selectHasPrefetchedBatches', () => {
      it('should return true when prefetched batches exist', async () => {
        const mockBatch: Statement[] = [
          {
            statementId: 'batch1',
            statement: 'Batch statement',
            creatorId: 'user1',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ];

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ statements: mockBatch }),
        });

        await store.dispatch(
          prefetchRandomBatches({ statementId: 'parent1', batchCount: 1 }) as any
        );

        const hasPrefetched = selectHasPrefetchedBatches(store.getState());
        expect(hasPrefetched).toBe(true);
      });
    });

    describe('selectCurrentBatchEvaluationProgress', () => {
      it('should calculate evaluation progress correctly', () => {
        const mockStatements: Statement[] = [
          {
            statementId: 'stmt1',
            statement: 'Statement 1',
            creatorId: 'user1',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
          {
            statementId: 'stmt2',
            statement: 'Statement 2',
            creatorId: 'user2',
            parentId: 'parent1',
            statementType: StatementType.option,
            createdAt: Date.now(),
            lastUpdate: Date.now(),
          },
        ];

        store.dispatch(setRandomStatements(mockStatements));
        store.dispatch(updateEvaluationCount('stmt1'));

        const progress = selectCurrentBatchEvaluationProgress(store.getState());

        expect(progress.evaluated).toBe(1);
        expect(progress.total).toBe(2);
        expect(progress.remaining).toBe(1);
        expect(progress.percentage).toBe(50);
      });
    });
  });
});