import { useEffect, useRef } from 'react';
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
  const countedEvaluations = useRef<Set<string>>(new Set());
  const previousStatementIds = useRef<string[]>([]);

  useEffect(() => {
    // Check if statement IDs have changed (new batch)
    const idsChanged = JSON.stringify(previousStatementIds.current) !== JSON.stringify(statementIds);

    if (idsChanged) {
      // Clear counted evaluations for new batch
      countedEvaluations.current.clear();
      previousStatementIds.current = [...statementIds];
    }

    // Check if any of the current batch statements have been evaluated
    const evaluatedStatements = evaluations.filter(evaluation =>
      statementIds.includes(evaluation.statementId)
    );

    // Track new evaluations to dispatch
    const newEvaluations: string[] = [];

    evaluatedStatements.forEach(evaluation => {
      const evaluationKey = `${evaluation.statementId}-${evaluation.userId || 'anonymous'}`;
      if (!countedEvaluations.current.has(evaluationKey)) {
        countedEvaluations.current.add(evaluationKey);
        newEvaluations.push(evaluation.statementId);
      }
    });

    // Dispatch updates only for new evaluations
    if (newEvaluations.length > 0) {
      // Batch dispatch to prevent multiple re-renders
      newEvaluations.forEach(statementId => {
        dispatch(updateEvaluationCount(statementId));
      });
    }
  }, [evaluations, statementIds, dispatch]);
}