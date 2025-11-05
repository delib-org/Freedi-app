import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../types';
import { Statement, MassConsensusProcess, updateArray, MassConsensusStage } from 'delib-npm';
import { defaultMassConsensusProcess } from '@/model/massConsensus/massConsensusModel';
import { APIEndPoint } from '@/controllers/general/apiEndpoint';

export enum Status {
    idle = 'idle',
    loading = 'loading',
    failed = 'failed',
}

// Define a type for the slice state
export interface MassConsensusState {
    similarStatements: Statement[];
    massConsensusProcess: MassConsensusProcess[];

    // New fields for batch support
    randomStatements: Statement[];
    randomStatementsBatches: Statement[][]; // History of batches
    currentRandomBatch: number;
    viewedStatementIds: string[]; // Track viewed statements

    // Prefetch cache
    prefetch: {
        randomBatches: Statement[][];
        randomBatchesTimestamp: number;
        randomBatchesParentId: string;
        topStatements: Statement[];
        topStatementsTimestamp: number;
        topStatementsParentId: string;
    };

    // Loading states
    loading: {
        fetchingNewRandom: boolean;
        prefetchingRandom: boolean;
        prefetchingTop: boolean;
    };

    // UI state
    ui: {
        evaluationsPerBatch: Record<number, number>;
        canGetNewSuggestions: boolean;
        totalBatchesViewed: number;
        cyclesCompleted: number; // Track how many times we've recycled through all suggestions
        allSuggestionsViewed: boolean; // Flag when all available suggestions have been seen
        showRecycleMessage: boolean; // Show message when recycling suggestions
    };

    // Error states
    errors: {
        randomSuggestions?: string;
        topSuggestions?: string;
    };
}

// Helper function to check cache freshness (5 minutes)
const isCacheFresh = (timestamp: number): boolean => {
    return Date.now() - timestamp < 5 * 60 * 1000;
};

// Async thunk for fetching a new batch of random statements
export const fetchNewRandomBatch = createAsyncThunk<
    { statements: Statement[]; isRecycled: boolean },
    string, // statementId
    { state: RootState }
>(
    'massConsensus/fetchNewRandomBatch',
    async (statementId: string, { getState, dispatch }) => {
        const state = getState();
        let viewedIds = state.massConsensus.viewedStatementIds;
        let isRecycled = false;

        // First attempt with current viewed IDs
        let endPoint = APIEndPoint('getRandomStatements', {
            parentId: statementId,
            limit: 6,
            excludeIds: viewedIds.join(','),
        });

        let response = await fetch(endPoint);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
        }

        let { statements } = await response.json();

        // If no statements returned, we've seen everything - reset and try again
        if (!statements || statements.length === 0) {
            console.info('All suggestions viewed, recycling through suggestions...');
            isRecycled = true;

            // Reset viewed IDs to allow recycling
            dispatch(massConsensusSlice.actions.resetViewedStatements());

            // Fetch again without excludeIds
            endPoint = APIEndPoint('getRandomStatements', {
                parentId: statementId,
                limit: 6,
                excludeIds: '',
            });

            response = await fetch(endPoint);
            if (!response.ok) {
                throw new Error(`Failed to fetch recycled: ${response.status}`);
            }

            const recycledData = await response.json();
            statements = recycledData.statements || [];
        }

        return { statements: statements as Statement[], isRecycled };
    }
);

// Async thunk for prefetching multiple batches
export const prefetchRandomBatches = createAsyncThunk<
    Statement[][],
    { statementId: string; batchCount?: number },
    { state: RootState }
>(
    'massConsensus/prefetchRandomBatches',
    async ({ statementId, batchCount = 3 }, { getState }) => {
        const state = getState();
        const viewedIds = new Set(state.massConsensus.viewedStatementIds);
        const batches: Statement[][] = [];

        for (let i = 0; i < batchCount; i++) {
            const endPoint = APIEndPoint('getRandomStatements', {
                parentId: statementId,
                limit: 6,
                excludeIds: Array.from(viewedIds).join(','),
            });

            const response = await fetch(endPoint);
            if (!response.ok) {
                console.error(`Failed to prefetch batch ${i}`);
                continue;
            }

            const { statements } = await response.json();
            batches.push(statements);

            // Add to temp viewed to avoid duplicates in next batch
            statements.forEach((s: Statement) => viewedIds.add(s.statementId));
        }

        return batches;
    }
);

// Async thunk for prefetching top statements
export const prefetchTopStatements = createAsyncThunk<
    Statement[],
    string, // statementId
    { state: RootState }
>(
    'massConsensus/prefetchTopStatements',
    async (statementId: string) => {
        const endPoint = APIEndPoint('getTopStatements', {
            parentId: statementId,
            limit: 6,
        });

        const response = await fetch(endPoint);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
        }

        const { statements } = await response.json();
        
return statements as Statement[];
    }
);

// Define the initial state using that type
const initialState: MassConsensusState = {
    similarStatements: [],
    massConsensusProcess: [],

    // Batch support
    randomStatements: [],
    randomStatementsBatches: [],
    currentRandomBatch: 0,
    viewedStatementIds: [],

    // Prefetch cache
    prefetch: {
        randomBatches: [],
        randomBatchesTimestamp: 0,
        randomBatchesParentId: '',
        topStatements: [],
        topStatementsTimestamp: 0,
        topStatementsParentId: '',
    },

    // Loading states
    loading: {
        fetchingNewRandom: false,
        prefetchingRandom: false,
        prefetchingTop: false,
    },

    // UI state
    ui: {
        evaluationsPerBatch: {},
        canGetNewSuggestions: false,
        totalBatchesViewed: 1,
        cyclesCompleted: 0,
        allSuggestionsViewed: false,
        showRecycleMessage: false,
    },

    // Error states
    errors: {},
};

export const massConsensusSlice = createSlice({
    name: 'mass-consensus',
    initialState,
    reducers: {
        setSimilarStatements: (
            state,
            action: PayloadAction<Statement[]>
        ) => {
            state.similarStatements = action.payload;
        },
        setMassConsensusProcess: (
            state,
            action: PayloadAction<MassConsensusProcess>
        ) => {
            state.massConsensusProcess = updateArray(
                state.massConsensusProcess, action.payload, 'statementId');
        },
        deleteMassConsensusProcess: (
            state,
            action: PayloadAction<string>
        ) => {
            state.massConsensusProcess = state.massConsensusProcess.filter(
                (process) => process.statementId !== action.payload
            );
        },

        // New reducers for batch support
        setRandomStatements: (state, action: PayloadAction<Statement[]>) => {
            state.randomStatements = action.payload;
            // Mark statements as viewed
            action.payload.forEach(s => {
                if (!state.viewedStatementIds.includes(s.statementId)) {
                    state.viewedStatementIds.push(s.statementId);
                }
            });
            // Reset evaluations for this batch
            state.ui.evaluationsPerBatch[state.currentRandomBatch] = 0;
            state.ui.canGetNewSuggestions = false;
        },

        loadNextRandomBatch: (state) => {
            // Check if we have prefetched batches
            if (state.prefetch.randomBatches.length > 0) {
                // Save current batch to history
                if (state.randomStatements.length > 0) {
                    state.randomStatementsBatches.push(state.randomStatements);
                }

                // Get next batch from prefetch
                const nextBatch = state.prefetch.randomBatches.shift();
                if (nextBatch) {
                    state.randomStatements = nextBatch;
                    state.currentRandomBatch++;
                    state.ui.totalBatchesViewed++;

                    // Mark as viewed
                    nextBatch.forEach(s => {
                        if (!state.viewedStatementIds.includes(s.statementId)) {
                            state.viewedStatementIds.push(s.statementId);
                        }
                    });

                    // Reset UI state
                    state.ui.evaluationsPerBatch[state.currentRandomBatch] = 0;
                    state.ui.canGetNewSuggestions = false;
                }
            }
        },

        updateEvaluationCount: (state, _action: PayloadAction<string>) => {
            const currentBatch = state.currentRandomBatch;
            if (!state.ui.evaluationsPerBatch[currentBatch]) {
                state.ui.evaluationsPerBatch[currentBatch] = 0;
            }
            state.ui.evaluationsPerBatch[currentBatch]++;

            // Check if all evaluated
            const evaluatedCount = state.ui.evaluationsPerBatch[currentBatch];
            const totalInBatch = state.randomStatements.length;
            state.ui.canGetNewSuggestions = evaluatedCount >= totalInBatch;
        },

        clearPrefetchedRandomBatches: (state) => {
            state.prefetch.randomBatches = [];
            state.prefetch.randomBatchesTimestamp = 0;
        },

        clearPrefetchedTopStatements: (state) => {
            state.prefetch.topStatements = [];
            state.prefetch.topStatementsTimestamp = 0;
        },

        resetRandomSuggestions: (state) => {
            state.randomStatements = [];
            state.randomStatementsBatches = [];
            state.currentRandomBatch = 0;
            state.viewedStatementIds = [];
            state.ui.evaluationsPerBatch = {};
            state.ui.canGetNewSuggestions = false;
            state.ui.totalBatchesViewed = 1;
            state.ui.cyclesCompleted = 0;
            state.ui.allSuggestionsViewed = false;
            state.ui.showRecycleMessage = false;
        },

        resetViewedStatements: (state) => {
            // Reset viewed statements to allow recycling
            state.viewedStatementIds = [];
            state.ui.cyclesCompleted++;
            state.ui.allSuggestionsViewed = true;
            state.ui.showRecycleMessage = true;
        },

        dismissRecycleMessage: (state) => {
            state.ui.showRecycleMessage = false;
        }
    },

    extraReducers: (builder) => {
        builder
            // Handle fetchNewRandomBatch
            .addCase(fetchNewRandomBatch.pending, (state) => {
                state.loading.fetchingNewRandom = true;
                state.errors.randomSuggestions = undefined;
            })
            .addCase(fetchNewRandomBatch.fulfilled, (state, action) => {
                state.loading.fetchingNewRandom = false;
                const { statements, isRecycled } = action.payload;

                // Save current batch to history
                if (state.randomStatements.length > 0) {
                    state.randomStatementsBatches.push(state.randomStatements);
                }

                // Set new batch
                state.randomStatements = statements;
                state.currentRandomBatch++;
                state.ui.totalBatchesViewed++;

                // If this is recycled content, show the message
                if (isRecycled) {
                    state.ui.showRecycleMessage = true;
                }

                // Mark as viewed
                statements.forEach(s => {
                    if (!state.viewedStatementIds.includes(s.statementId)) {
                        state.viewedStatementIds.push(s.statementId);
                    }
                });

                // Reset UI state
                state.ui.evaluationsPerBatch[state.currentRandomBatch] = 0;
                state.ui.canGetNewSuggestions = false;
            })
            .addCase(fetchNewRandomBatch.rejected, (state, action) => {
                state.loading.fetchingNewRandom = false;
                state.errors.randomSuggestions = action.error.message;
            })

            // Handle prefetchRandomBatches
            .addCase(prefetchRandomBatches.pending, (state) => {
                state.loading.prefetchingRandom = true;
            })
            .addCase(prefetchRandomBatches.fulfilled, (state, action) => {
                state.loading.prefetchingRandom = false;
                state.prefetch.randomBatches = action.payload;
                state.prefetch.randomBatchesTimestamp = Date.now();
                state.prefetch.randomBatchesParentId = action.meta.arg.statementId;
            })
            .addCase(prefetchRandomBatches.rejected, (state) => {
                state.loading.prefetchingRandom = false;
            })

            // Handle prefetchTopStatements
            .addCase(prefetchTopStatements.pending, (state) => {
                state.loading.prefetchingTop = true;
            })
            .addCase(prefetchTopStatements.fulfilled, (state, action) => {
                state.loading.prefetchingTop = false;
                state.prefetch.topStatements = action.payload;
                state.prefetch.topStatementsTimestamp = Date.now();
                state.prefetch.topStatementsParentId = action.meta.arg;
            })
            .addCase(prefetchTopStatements.rejected, (state) => {
                state.loading.prefetchingTop = false;
            });
    }
});

export const {
    setSimilarStatements,
    setMassConsensusProcess,
    deleteMassConsensusProcess,
    setRandomStatements,
    loadNextRandomBatch,
    updateEvaluationCount,
    clearPrefetchedRandomBatches,
    clearPrefetchedTopStatements,
    resetRandomSuggestions,
    resetViewedStatements,
    dismissRecycleMessage
} = massConsensusSlice.actions;

// Original selectors
export const selectSimilarStatements = (state: RootState) =>
    state.massConsensus.similarStatements;
export const selectSimilarStatementsByStatementId =
    (statementId: string) => (state: RootState) =>
        state.massConsensus.similarStatements.filter(
            (statement: Statement) =>
                statement.statementId === statementId
        );

export const massConsensusProcessSelector = (statementId: string) => (state: RootState) => 
    state.massConsensus.massConsensusProcess.find((process) => process.statementId === statementId) || null;

export const massConsensusStagesSelector = (statementId: string) => (state: RootState): MassConsensusStage[] => {
    const process = state.massConsensus.massConsensusProcess.find((process) => process.statementId === statementId);
    
    return process?.stages || defaultMassConsensusProcess;
}

// New selectors for batch support
export const selectRandomStatements = (state: RootState) =>
    state.massConsensus.randomStatements;

export const selectCanGetNewSuggestions = (state: RootState) =>
    state.massConsensus.ui.canGetNewSuggestions;

export const selectIsLoadingNewRandom = (state: RootState) =>
    state.massConsensus.loading.fetchingNewRandom;

export const selectCurrentBatch = (state: RootState) =>
    state.massConsensus.currentRandomBatch;

export const selectTotalBatchesViewed = (state: RootState) =>
    state.massConsensus.ui.totalBatchesViewed;

export const selectViewedStatementIds = (state: RootState) =>
    state.massConsensus.viewedStatementIds;

export const selectHasPrefetchedBatches = (state: RootState) =>
    state.massConsensus.prefetch.randomBatches.length > 0;

export const selectCyclesCompleted = (state: RootState) =>
    state.massConsensus.ui.cyclesCompleted;

export const selectShowRecycleMessage = (state: RootState) =>
    state.massConsensus.ui.showRecycleMessage;

export const selectAllSuggestionsViewed = (state: RootState) =>
    state.massConsensus.ui.allSuggestionsViewed;

// Memoized selector for random suggestions state
export const selectRandomSuggestionsState = createSelector(
    [(state: RootState) => state.massConsensus],
    (massConsensus) => ({
        randomStatements: massConsensus.randomStatements,
        currentBatch: massConsensus.currentRandomBatch,
        canGetNewSuggestions: massConsensus.ui.canGetNewSuggestions,
        isLoadingNew: massConsensus.loading.fetchingNewRandom,
        hasPrefetchedBatches: massConsensus.prefetch.randomBatches.length > 0,
        totalBatchesViewed: massConsensus.ui.totalBatchesViewed,
        evaluationsPerBatch: massConsensus.ui.evaluationsPerBatch,
        viewedStatementIds: massConsensus.viewedStatementIds,
        cyclesCompleted: massConsensus.ui.cyclesCompleted,
        allSuggestionsViewed: massConsensus.ui.allSuggestionsViewed,
        showRecycleMessage: massConsensus.ui.showRecycleMessage,
    })
);

// Selector for prefetched top statements
export const selectPrefetchedTopStatements = createSelector(
    [(state: RootState) => state.massConsensus.prefetch],
    (prefetch) => {
        if (!prefetch.topStatements.length) return null;
        if (!isCacheFresh(prefetch.topStatementsTimestamp)) return null;
        
return prefetch.topStatements;
    }
);

// Selector for evaluation progress in current batch
export const selectCurrentBatchEvaluationProgress = createSelector(
    [
        (state: RootState) => state.massConsensus.randomStatements,
        (state: RootState) => state.massConsensus.ui.evaluationsPerBatch,
        (state: RootState) => state.massConsensus.currentRandomBatch,
    ],
    (statements, evaluationsPerBatch, currentBatch) => {
        const total = statements.length;
        const evaluated = evaluationsPerBatch[currentBatch] || 0;
        
return {
            evaluated,
            total,
            remaining: total - evaluated,
            percentage: total > 0 ? (evaluated / total) * 100 : 0,
        };
    }
);

export default massConsensusSlice.reducer;
