'use client';

import { useState, useEffect } from 'react';
import { Statement } from 'delib-npm';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import SolutionCard from './SolutionCard';
import AddSolutionForm from './AddSolutionForm';
import ProgressTracker from '@/components/progress/ProgressTracker';
import FAB from '@/components/fab/FAB';
import styles from './SolutionFeed.module.scss';

interface SolutionFeedClientProps {
  question: Statement;
  initialSolutions: Statement[];
}

/**
 * Client Component - Interactive solution feed
 * Handles batch loading, evaluations, and user interactions
 * Inspired by RandomSuggestions.tsx
 */
export default function SolutionFeedClient({
  question,
  initialSolutions,
}: SolutionFeedClientProps) {
  const [solutions, setSolutions] = useState<Statement[]>(initialSolutions);
  const [userId, setUserId] = useState<string>('');
  const [evaluatedIds, setEvaluatedIds] = useState<Set<string>>(new Set());
  const [allEvaluatedIds, setAllEvaluatedIds] = useState<Set<string>>(new Set());
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [allOptionsEvaluated, setAllOptionsEvaluated] = useState(false);

  const questionId = question.statementId;
  const totalOptionsCount = question.numberOfOptions || 0;

  // Initialize user ID and load evaluation history on mount
  useEffect(() => {
    const id = getOrCreateAnonymousUser();
    setUserId(id);

    // Load user's evaluation history
    const loadEvaluationHistory = async () => {
      try {
        const response = await fetch(`/api/user-evaluations/${questionId}?userId=${id}`);
        if (response.ok) {
          const data = await response.json();
          const evaluatedSet = new Set<string>(data.evaluatedOptionsIds || []);
          setAllEvaluatedIds(evaluatedSet);

          // Check if all options are already evaluated
          if (totalOptionsCount > 0 && evaluatedSet.size >= totalOptionsCount) {
            setAllOptionsEvaluated(true);
          }

          // Mark current batch items as evaluated if they were previously evaluated
          const currentBatchEvaluated = new Set<string>();
          solutions.forEach(solution => {
            if (evaluatedSet.has(solution.statementId)) {
              currentBatchEvaluated.add(solution.statementId);
            }
          });
          setEvaluatedIds(currentBatchEvaluated);
        }
      } catch (error) {
        console.error('Failed to load evaluation history:', error);
      }
    };

    if (id) {
      loadEvaluationHistory();
    }
  }, [questionId, totalOptionsCount, solutions]);

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
      setAllEvaluatedIds((prev) => new Set(prev).add(solutionId));

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

      // Check if all options have been evaluated
      const newTotalEvaluated = allEvaluatedIds.size + 1;
      if (totalOptionsCount > 0 && newTotalEvaluated >= totalOptionsCount) {
        setAllOptionsEvaluated(true);
      }
    } catch (error) {
      console.error('Evaluation error:', error);
      // Revert optimistic update
      setEvaluatedIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(solutionId);
        return newSet;
      });
      setAllEvaluatedIds((prev) => {
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
    if (!canGetNewBatch || isLoadingBatch || allOptionsEvaluated) return;

    setIsLoadingBatch(true);
    setError(null);

    try {
      const response = await fetch(`/api/statements/${questionId}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          excludeIds: Array.from(allEvaluatedIds), // Use all evaluated IDs, not just current batch
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch new batch');
      }

      const data = await response.json();

      if (data.solutions && data.solutions.length > 0) {
        setSolutions(data.solutions);
        setEvaluatedIds(new Set()); // Reset current batch tracking
        setBatchCount((prev) => prev + 1);
      } else {
        // No more solutions available - all have been evaluated
        setAllOptionsEvaluated(true);
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

  /**
   * Handle FAB solution submission
   */
  const handleFABSubmit = async (text: string): Promise<void> => {
    try {
      const response = await fetch(`/api/statements/${questionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          statement: text,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit solution');
      }

      const newSolution = await response.json();
      handleSolutionSubmitted(newSolution);
    } catch (error) {
      console.error('Failed to submit solution:', error);
      throw error;
    }
  };

  // Calculate stats for progress tracker
  const totalEvaluations = allEvaluatedIds.size;
  const currentStreak = typeof window !== 'undefined'
    ? parseInt(localStorage.getItem('evaluationStreak') || '0')
    : 0;
  const userLevel = Math.floor(totalEvaluations / 10) + 1;
  const achievements = [];
  if (totalEvaluations >= 10) achievements.push('First 10 Evaluations!');
  if (totalEvaluations >= 50) achievements.push('Consensus Builder');
  if (totalEvaluations >= 100) achievements.push('Mass Consensus Expert');

  return (
    <div className={styles.feed}>
      {/* Progress Tracker - Gamification */}
      <ProgressTracker
        evaluationCount={totalEvaluations}
        totalEvaluations={totalOptionsCount || 100}
        streak={currentStreak}
        level={userLevel}
        achievements={achievements}
      />

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
        {allOptionsEvaluated ? (
          <div className={styles.completionMessage}>
            <h3>🎉 Thank you!</h3>
            <p>You have evaluated all {totalOptionsCount} available options.</p>
            <p>Your feedback helps improve the quality of solutions.</p>
          </div>
        ) : (
          <>
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
                <span>
                  Get New Batch
                  {totalOptionsCount > 0 && (
                    <span className={styles.progress}>
                      {' '}({allEvaluatedIds.size}/{totalOptionsCount} evaluated)
                    </span>
                  )}
                </span>
              )}
            </button>

            {!canGetNewBatch && (
              <p className={styles.hint}>
                Evaluate all solutions to get new ones ({solutions.length - evaluatedCount} left in this batch)
              </p>
            )}
          </>
        )}
      </div>

      {/* Add solution form - Hidden when FAB is active */}
      <div style={{ display: 'none' }}>
        <AddSolutionForm
          questionId={questionId}
          userId={userId}
          onSubmit={handleSolutionSubmitted}
        />
      </div>

      {/* Floating Action Button */}
      <FAB onSubmit={handleFABSubmit} />
    </div>
  );
}
