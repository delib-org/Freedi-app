import React, { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useEvaluationTracking } from '../useEvaluationTracking';
import massConsensusReducer, { updateEvaluationCount } from '@/redux/massConsensus/massConsensusSlice';
import evaluationsReducer from '@/redux/evaluations/evaluationsSlice';

// Mock the updateEvaluationCount action
jest.mock('@/redux/massConsensus/massConsensusSlice', () => ({
  ...jest.requireActual('@/redux/massConsensus/massConsensusSlice'),
  updateEvaluationCount: jest.fn((statementId: string) => ({
    type: 'massConsensus/updateEvaluationCount',
    payload: statementId,
  })),
}));

describe('useEvaluationTracking', () => {
  let store: ReturnType<typeof configureStore>;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  beforeEach(() => {
    jest.clearAllMocks();

    store = configureStore({
      reducer: {
        massConsensus: massConsensusReducer,
        evaluations: evaluationsReducer,
      },
      preloadedState: {
        evaluations: {
          evaluations: [],
        },
      },
    });

    wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      React.createElement(Provider, { store }, children)
    );
  });

  it('should dispatch updateEvaluationCount when evaluations match statement IDs', () => {
    const statementIds = ['stmt1', 'stmt2', 'stmt3'];

    // Set up evaluations in store
    store.dispatch({
      type: 'evaluations/setEvaluations',
      payload: [
        { statementId: 'stmt1', userId: 'user1', evaluation: 5 },
        { statementId: 'stmt2', userId: 'user1', evaluation: 3 },
      ],
    });

    renderHook(() => useEvaluationTracking(statementIds), { wrapper });

    // Check that updateEvaluationCount was called for each matching evaluation
    expect(updateEvaluationCount).toHaveBeenCalledWith('stmt1');
    expect(updateEvaluationCount).toHaveBeenCalledWith('stmt2');
    expect(updateEvaluationCount).toHaveBeenCalledTimes(2);
  });

  it('should not dispatch when no evaluations match statement IDs', () => {
    const statementIds = ['stmt1', 'stmt2'];

    // Set up evaluations that don't match
    store.dispatch({
      type: 'evaluations/setEvaluations',
      payload: [
        { statementId: 'stmt3', userId: 'user1', evaluation: 5 },
        { statementId: 'stmt4', userId: 'user1', evaluation: 3 },
      ],
    });

    renderHook(() => useEvaluationTracking(statementIds), { wrapper });

    expect(updateEvaluationCount).not.toHaveBeenCalled();
  });

  it('should update when evaluations change', () => {
    const statementIds = ['stmt1', 'stmt2'];

    const { rerender } = renderHook(
      () => useEvaluationTracking(statementIds),
      { wrapper }
    );

    // Initially no evaluations
    expect(updateEvaluationCount).not.toHaveBeenCalled();

    // Add an evaluation
    store.dispatch({
      type: 'evaluations/setEvaluations',
      payload: [
        { statementId: 'stmt1', userId: 'user1', evaluation: 5 },
      ],
    });

    rerender();

    expect(updateEvaluationCount).toHaveBeenCalledWith('stmt1');
    expect(updateEvaluationCount).toHaveBeenCalledTimes(1);
  });

  it('should handle empty statement IDs array', () => {
    const statementIds: string[] = [];

    store.dispatch({
      type: 'evaluations/setEvaluations',
      payload: [
        { statementId: 'stmt1', userId: 'user1', evaluation: 5 },
      ],
    });

    renderHook(() => useEvaluationTracking(statementIds), { wrapper });

    expect(updateEvaluationCount).not.toHaveBeenCalled();
  });

  it('should handle multiple evaluations for the same statement', () => {
    const statementIds = ['stmt1'];

    store.dispatch({
      type: 'evaluations/setEvaluations',
      payload: [
        { statementId: 'stmt1', userId: 'user1', evaluation: 5 },
        { statementId: 'stmt1', userId: 'user2', evaluation: 3 },
      ],
    });

    renderHook(() => useEvaluationTracking(statementIds), { wrapper });

    // Should be called once for each evaluation
    expect(updateEvaluationCount).toHaveBeenCalledWith('stmt1');
    expect(updateEvaluationCount).toHaveBeenCalledTimes(2);
  });

  it('should re-evaluate when statement IDs change', () => {
    const { rerender } = renderHook(
      ({ ids }) => useEvaluationTracking(ids),
      {
        wrapper,
        initialProps: { ids: ['stmt1'] },
      }
    );

    store.dispatch({
      type: 'evaluations/setEvaluations',
      payload: [
        { statementId: 'stmt1', userId: 'user1', evaluation: 5 },
        { statementId: 'stmt2', userId: 'user1', evaluation: 3 },
      ],
    });

    expect(updateEvaluationCount).toHaveBeenCalledWith('stmt1');
    expect(updateEvaluationCount).toHaveBeenCalledTimes(1);

    // Clear previous calls
    jest.clearAllMocks();

    // Change statement IDs
    rerender({ ids: ['stmt2'] });

    expect(updateEvaluationCount).toHaveBeenCalledWith('stmt2');
    expect(updateEvaluationCount).toHaveBeenCalledTimes(1);
  });
});