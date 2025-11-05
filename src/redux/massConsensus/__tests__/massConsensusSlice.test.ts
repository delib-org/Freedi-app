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

    it('should have initial state', () => {
        // Placeholder test - add actual tests here
        expect(massConsensusReducer).toBeDefined();
    });
});