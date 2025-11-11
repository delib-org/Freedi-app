'use client';

import { useState, useEffect } from 'react';
import { Statement } from 'delib-npm';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import SolutionCard from './SolutionCard';
import AddSolutionForm from './AddSolutionForm';
import styles from './SolutionFeed.module.css';

interface SolutionFeedClientProps {
  questionId: string;
  initialSolutions: Statement[];
}

/**
 * Client Component - Interactive solution feed
 * Handles batch loading, evaluations, and user interactions
 * Inspired by RandomSuggestions.tsx
 */
export default function SolutionFeedClient({
  questionId,
  initialSolutions,
}: SolutionFeedClientProps) {
  const [solutions, setSolutions] = useState<Statement[]>(initialSolutions);
  const [userId, setUserId] = useState<string>('');
  const [evaluatedIds, setEvaluatedIds] = useState<Set<string>>(new Set());
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Initialize user ID on mount
  useEffect(() => {
    const id = getOrCreateAnonymousUser();
    setUserId(id);
  }, []);

  // Track evaluated solutions count
  const evaluatedCount = evaluatedIds.size;
  const canGetNewBatch = evaluatedCount >= solutions.length;

  /**
   * Handle evaluation of a solution
   */
  const handleEvaluate = async (solutionId: string, score: number) => {
    try {
      // Optimistic update
      setEvaluatedIds((prev) => new Set(prev).add(solutionId));

      // Call API
      const response = await fetch(`/api/evaluations/${solutionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          evaluation: score,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save evaluation');
      }
    } catch (error) {
      console.error('Evaluation error:', error);
      // Revert optimistic update
      setEvaluatedIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(solutionId);
        return newSet;
      });
      setError('Failed to save your evaluation. Please try again.');
    }
  };

  /**
   * Fetch new batch of solutions
   */
  const handleGetNewBatch = async () => {
    if (!canGetNewBatch || isLoadingBatch) return;

    setIsLoadingBatch(true);
    setError(null);

    try {
      const response = await fetch(`/api/statements/${questionId}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          excludeIds: solutions.map((s) => s.statementId),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch new batch');
      }

      const data = await response.json();

      if (data.solutions && data.solutions.length > 0) {
        setSolutions(data.solutions);
        setEvaluatedIds(new Set());
        setBatchCount((prev) => prev + 1);
      } else {
        setError('No more solutions available. You've seen them all!');
      }
    } catch (error) {
      console.error('Batch fetch error:', error);
      setError('Failed to load new solutions. Please try again.');
    } finally {
      setIsLoadingBatch(false);
    }
  };

  /**
   * Handle new solution submission
   */
  const handleSolutionSubmitted = (newSolution: Statement) => {
    // Could add to current batch or show success message
    console.info('New solution submitted:', newSolution.statementId);
  };

  return (
    <div className={styles.feed}>
      {/* Batch indicator */}
      {batchCount > 1 && (
        <div className={styles.batchIndicator}>
          Batch {batchCount}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Instructions */}
      <div className={styles.instructions}>
        <h3>Please rate the following solutions</h3>
        <p>Evaluate each solution from -1 (strongly disagree) to +1 (strongly agree)</p>
      </div>

      {/* Solution cards */}
      <div className={styles.solutions}>
        {solutions.map((solution) => (
          <SolutionCard
            key={solution.statementId}
            solution={solution}
            onEvaluate={handleEvaluate}
            isEvaluated={evaluatedIds.has(solution.statementId)}
          />
        ))}
      </div>

      {/* Batch controls */}
      <div className={styles.batchControls}>
        <button
          onClick={handleGetNewBatch}
          disabled={!canGetNewBatch || isLoadingBatch}
          className={`${styles.batchButton} ${
            !canGetNewBatch || isLoadingBatch ? styles.disabled : ''
          }`}
        >
          {isLoadingBatch ? (
            <span>Loading new solutions...</span>
          ) : (
            <span>Get New Batch</span>
          )}
        </button>

        {!canGetNewBatch && (
          <p className={styles.hint}>
            Evaluate all solutions to get new ones ({solutions.length - evaluatedCount} left)
          </p>
        )}
      </div>

      {/* Add solution form */}
      <AddSolutionForm
        questionId={questionId}
        userId={userId}
        onSubmit={handleSolutionSubmitted}
      />
    </div>
  );
}
