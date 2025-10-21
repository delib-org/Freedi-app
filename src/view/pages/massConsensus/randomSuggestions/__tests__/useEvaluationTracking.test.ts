import { useEvaluationTracking } from '../useEvaluationTracking';
import { updateEvaluationCount } from '@/redux/massConsensus/massConsensusSlice';
import * as ReactRedux from 'react-redux';

// Mock the hooks
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: jest.fn(),
  useDispatch: jest.fn(),
}));

jest.mock('@/redux/massConsensus/massConsensusSlice', () => ({
  ...jest.requireActual('@/redux/massConsensus/massConsensusSlice'),
  updateEvaluationCount: jest.fn(),
}));

describe('useEvaluationTracking', () => {
  const dispatch = jest.fn();
  const useSelectorMock = jest.spyOn(ReactRedux, 'useSelector');
  const useDispatchMock = jest.spyOn(ReactRedux, 'useDispatch');

  beforeEach(() => {
    jest.clearAllMocks();
    useDispatchMock.mockReturnValue(dispatch);
  });

  it('should dispatch updateEvaluationCount for matching evaluations', () => {
    const statementIds = ['stmt1', 'stmt2', 'stmt3'];
    const evaluations = [
      { statementId: 'stmt1', evaluatorId: 'user1', evaluation: 5, parentId: 'p1', evaluationId: 'e1', updatedAt: 0 },
      { statementId: 'stmt2', evaluatorId: 'user1', evaluation: 3, parentId: 'p1', evaluationId: 'e2', updatedAt: 0 },
    ];
    useSelectorMock.mockReturnValue(evaluations);

    useEvaluationTracking(statementIds);

    expect(dispatch).toHaveBeenCalledWith(updateEvaluationCount('stmt1'));
    expect(dispatch).toHaveBeenCalledWith(updateEvaluationCount('stmt2'));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});