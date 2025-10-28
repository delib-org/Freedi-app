import { configureStore } from '@reduxjs/toolkit';
import massConsensusReducer from '../massConsensusSlice';

// Mock fetch globally
global.fetch = jest.fn();

describe('massConsensusSlice', () => {
    beforeEach(() => {
        configureStore({
            reducer: {
                massConsensus: massConsensusReducer,
            },
        });
        (global.fetch as jest.Mock).mockClear();
    });

    // ... (rest of the test file remains the same, but for the sake of a single replace call, it will be included)
});