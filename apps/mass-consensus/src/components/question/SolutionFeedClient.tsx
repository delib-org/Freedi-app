'use client';

import { useState, useEffect, useMemo } from 'react';
import { Statement } from 'delib-npm';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import { ToastProvider } from '@/components/shared/Toast';
import SolutionCard from './SolutionCard';
import SolutionPromptModal from './SolutionPromptModal';
import CompletionScreen from '@/components/completion/CompletionScreen';
import styles from './SolutionFeed.module.css';
import { useTranslation } from '@freedi/shared-i18n/next';

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
  const { t, tWithParams } = useTranslation();
  const [solutions, setSolutions] = useState<Statement[]>(initialSolutions);
  const [userId, setUserId] = useState<string>('');
  const [evaluatedIds, setEvaluatedIds] = useState<Set<string>>(new Set());
  const [allEvaluatedIds, setAllEvaluatedIds] = useState<Set<string>>(new Set());
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [allOptionsEvaluated, setAllOptionsEvaluated] = useState(false);
  const [showSolutionPrompt, setShowSolutionPrompt] = useState(false);
  const [hasCheckedUserSolutions, setHasCheckedUserSolutions] = useState(false);
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [hasShownCompletionScreen, setHasShownCompletionScreen] = useState(false);
  const [hasSubmittedSolution, setHasSubmittedSolution] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [showProgressIndicator, setShowProgressIndicator] = useState(true);

  const questionId = question.statementId;
  const totalOptionsCount = question.numberOfOptions || 0;
  // Type assertion needed as this property may not be in older delib-npm types
  const questionSettings = question.questionSettings as { askUserForASolutionBeforeEvaluation?: boolean } | undefined;
  const requiresSolution = questionSettings?.askUserForASolutionBeforeEvaluation || false;

  // Check if user has submitted solutions (for "require solution first" feature)
  useEffect(() => {
    if (!userId || hasCheckedUserSolutions) return;

    const checkUserSolutions = async () => {
      try {
        const response = await fetch(`/api/user-solutions/${questionId}?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          setHasSubmittedSolution(data.hasSubmitted);
          if (!data.hasSubmitted && requiresSolution) {
            setShowSolutionPrompt(true);
          }
        }
        setHasCheckedUserSolutions(true);
      } catch (error) {
        console.error('Failed to check user solutions:', error);
        setHasCheckedUserSolutions(true);
      }
    };

    checkUserSolutions();
  }, [userId, questionId, requiresSolution, hasCheckedUserSolutions]);

  // Fetch participant count for completion screen
  useEffect(() => {
    const fetchParticipantCount = async () => {
      try {
        const response = await fetch(`/api/statements/${questionId}/stats`);
        if (response.ok) {
          const data = await response.json();
          setParticipantCount(data.participantCount || 0);
        }
      } catch (error) {
        console.error('Failed to fetch participant count:', error);
      }
    };

    fetchParticipantCount();
  }, [questionId]);

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

  // Track evaluated solutions count - use useMemo to ensure stable computation during SSR hydration
  const evaluatedCount = useMemo(() => evaluatedIds.size, [evaluatedIds]);
  const canGetNewBatch = useMemo(() => evaluatedCount >= solutions.length, [evaluatedCount, solutions.length]);

  // Calculate earned badges count for progress indicator
  const earnedBadgesCount = useMemo(() => {
    let count = 0;
    if (participantCount > 0 && participantCount <= 50) count++; // early-contributor
    if (allEvaluatedIds.size >= 5) count++; // thoughtful-evaluator
    if (hasSubmittedSolution) count++; // solution-creator
    if (allEvaluatedIds.size > 0) count++; // consensus-participant (earned after first evaluation)
    return count;
  }, [participantCount, allEvaluatedIds.size, hasSubmittedSolution]);

  // Auto-hide progress indicator after 5 seconds, show briefly on new evaluation
  useEffect(() => {
    if (allEvaluatedIds.size > 0) {
      setShowProgressIndicator(true);
      const timer = setTimeout(() => {
        setShowProgressIndicator(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [allEvaluatedIds.size]);

  // Handle opening the completion/progress screen manually
  const handleViewProgress = () => {
    setShowCompletionScreen(true);
  };

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
   * Handle solution flow completion
   * Refresh the feed to show new/updated solutions
   */
  const handleSolutionComplete = async () => {
    // Mark that user has submitted a solution
    setHasSubmittedSolution(true);

    // Fetch a new batch to show the latest solutions
    setIsLoadingBatch(true);
    try {
      const response = await fetch(`/api/statements/${questionId}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          excludeIds: Array.from(allEvaluatedIds),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.solutions && data.solutions.length > 0) {
          setSolutions(data.solutions);
          setEvaluatedIds(new Set());
          setBatchCount((prev) => prev + 1);
        }
      }
    } catch (error) {
      console.error('Failed to refresh after submission:', error);
    } finally {
      setIsLoadingBatch(false);
    }
  };

  /**
   * Handle completion screen close
   * Navigate to results or continue evaluating
   */
  const handleCompletionClose = () => {
    setShowCompletionScreen(false);
  };

  return (
    <ToastProvider>
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
        <h3>{t('Please rate the following suggestions')}</h3>
        <p>{t('Evaluate each suggestion from -1 (strongly disagree) to +1 (strongly agree)')}</p>
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
            <h3>🎉 {t('Thank You')}!</h3>
            <p>{tWithParams('You have evaluated all {{count}} available options', { count: totalOptionsCount })}</p>
            <p>{t('Your feedback helps improve the quality of solutions')}</p>
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
                <span>{t('Loading new suggestions...')}</span>
              ) : (
                <span>
                  {t('Get New Suggestions')}
                  {totalOptionsCount > 0 && (
                    <span className={styles.progress}>
                      {' '}({allEvaluatedIds.size}/{totalOptionsCount} {t('Evaluated').toLowerCase()})
                    </span>
                  )}
                </span>
              )}
            </button>

            {!canGetNewBatch && (
              <p className={styles.hint}>
                {t('Evaluate all suggestions to get new ones')} ({solutions.length - evaluatedCount} {t('left')})
              </p>
            )}
          </>
        )}
      </div>

        {/* Fixed Bottom Container - Progress & Actions */}
        <div className={styles.bottomContainer}>
          {/* Progress Indicator - shows briefly after evaluation, auto-hides after 5s */}
          {allEvaluatedIds.size > 0 && showProgressIndicator && (
            <div className={styles.progressIndicator}>
              <div className={styles.progressStat}>
                <span className={styles.progressIcon}>🏆</span>
                <span className={styles.progressValue}>{earnedBadgesCount}</span>
                <span className={styles.progressLabel}>{t('badges')}</span>
              </div>
              <div className={styles.progressDivider} />
              <div className={styles.progressStat}>
                <span className={styles.progressIcon}>✓</span>
                <span className={styles.progressValue}>{allEvaluatedIds.size}</span>
                <span className={styles.progressLabel}>{t('evaluated')}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className={styles.actionButtons}>
            {/* View Progress Button - shows after first evaluation */}
            {allEvaluatedIds.size > 0 && (
              <button
                className={styles.viewProgressButton}
                onClick={handleViewProgress}
              >
                {t('View Progress')}
              </button>
            )}
            <button
              className={styles.addSolutionButton}
              onClick={() => setShowSolutionPrompt(true)}
            >
              {t('Add Solution')}
            </button>
          </div>
        </div>

        {/* Solution prompt modal - used for both initial prompt and manual add */}
        <SolutionPromptModal
          isOpen={showSolutionPrompt}
          onClose={() => setShowSolutionPrompt(false)}
          questionId={questionId}
          userId={userId}
          onSubmitSuccess={handleSolutionComplete}
          title={requiresSolution && !hasCheckedUserSolutions ? t('Add Your Solution First') : t('Add Solution')}
          description={requiresSolution && !hasCheckedUserSolutions
            ? t('Please share your idea before seeing and rating others')
            : t('Share your idea for this question')}
        />

        {/* Progress/Completion screen - shown when user clicks "View Progress" */}
        {showCompletionScreen && (
          <CompletionScreen
            questionId={questionId}
            userId={userId}
            participantCount={participantCount}
            solutionsEvaluated={allEvaluatedIds.size}
            hasSubmittedSolution={hasSubmittedSolution}
            onClose={handleCompletionClose}
          />
        )}
      </div>
    </ToastProvider>
  );
}
