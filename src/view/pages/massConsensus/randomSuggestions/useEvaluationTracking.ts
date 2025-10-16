import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateEvaluationCount } from '@/redux/massConsensus/massConsensusSlice';
import { evaluationsSelector } from '@/redux/evaluations/evaluationsSlice';

/**
 * Hook to track evaluations for random suggestions batch management
 * Updates the batch count whenever an evaluation is made
 */
export function useEvaluationTracking(statementIds: string[]) {
  const dispatch = useDispatch();
  const evaluations = useSelector(evaluationsSelector);

  useEffect(() => {
    // Check if any of the current batch statements have been evaluated
    const evaluatedStatements = evaluations.filter(evaluation =>
      statementIds.includes(evaluation.statementId)
    );

    // When a new evaluation is detected, update the count
    evaluatedStatements.forEach(evaluation => {
      dispatch(updateEvaluationCount(evaluation.statementId));
    });
  }, [evaluations, statementIds, dispatch]);
}