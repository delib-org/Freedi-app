'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Statement } from '@freedi/shared-types';
import { MergedQuestionSettings } from '@/lib/utils/settingsUtils';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import { ToastProvider } from '@/components/shared/Toast';
import SolutionCard from './SolutionCard';
import SolutionPromptModal from './SolutionPromptModal';
import CompletionScreen from '@/components/completion/CompletionScreen';
import styles from './SolutionFeed.module.css';
import { useTranslation } from '@freedi/shared-i18n/next';
import {
  trackPageView,
  trackEvaluation,
  trackNewBatchRequest,
  trackAddSolutionClick,
} from '@/lib/analytics';

interface SolutionFeedClientProps {
  question: Statement;
  initialSolutions: Statement[];
  /** Merged settings for this question (survey + per-question overrides) */
  mergedSettings?: MergedQuestionSettings;
}

/**
 * Client Component - Interactive solution feed
 * Handles batch loading, evaluations, and user interactions
 * Inspired by RandomSuggestions.tsx
 */
export default function SolutionFeedClient({
  question,
  initialSolutions,
  mergedSettings,
}: SolutionFeedClientProps) {
  const { t, tWithParams } = useTranslation();
  const [solutions, setSolutions] = useState<Statement[]>(initialSolutions);
  const [userId, setUserId] = useState<string>('');
  const [evaluationScores, setEvaluationScores] = useState<Map<string, number>>(new Map());
  const [allEvaluatedIds, setAllEvaluatedIds] = useState<Set<string>>(new Set());
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [allOptionsEvaluated, setAllOptionsEvaluated] = useState(false);
  const [showSolutionPrompt, setShowSolutionPrompt] = useState(false);
  const [hasCheckedUserSolutions, setHasCheckedUserSolutions] = useState(false);
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [hasSubmittedSolution, setHasSubmittedSolution] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [showProgressIndicator, setShowProgressIndicator] = useState(true);
  const hasTrackedPageView = useRef(false);

  const questionId = question.statementId;
  const totalOptionsCount = question.numberOfOptions || 0;

  // Use merged settings for "ask for suggestion before evaluation"
  // Falls back to question-level setting if not in survey context
  const questionSettingsLegacy = question.questionSettings as { askUserForASolutionBeforeEvaluation?: boolean } | undefined;
  const requiresSolution = mergedSettings?.askUserForASolutionBeforeEvaluation ??
    questionSettingsLegacy?.askUserForASolutionBeforeEvaluation ?? false;

  // Check if we're in survey context (to hide bottomContainer)
  const inSurveyContext = !!mergedSettings;

  // Debug logging
  console.info('[SolutionFeedClient] mergedSettings:', mergedSettings);
  console.info('[SolutionFeedClient] requiresSolution:', requiresSolution);
  console.info('[SolutionFeedClient] inSurveyContext:', inSurveyContext);

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

  // Emit solutions count for navigation (when solutions change)
  useEffect(() => {
    // Dispatch event with actual solutions count for navigation
    const event = new CustomEvent('solutions-loaded', {
      detail: { count: solutions.length, questionId }
    });
    window.dispatchEvent(event);
  }, [solutions.length, questionId]);

  // Initialize user ID and load evaluation history on mount
  useEffect(() => {
    const id = getOrCreateAnonymousUser();
    setUserId(id);

    // Track page view (only once)
    if (!hasTrackedPageView.current) {
      trackPageView(questionId, id);
      hasTrackedPageView.current = true;
    }

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

          // Fetch actual scores for current batch items that were previously evaluated
          const scoresMap = new Map<string, number>();
          const evaluatedSolutionsInBatch = solutions.filter(solution =>
            evaluatedSet.has(solution.statementId)
          );

          // Fetch scores for each evaluated solution in parallel
          await Promise.all(
            evaluatedSolutionsInBatch.map(async (solution) => {
              try {
                const evalResponse = await fetch(
                  `/api/evaluations/${solution.statementId}?userId=${id}`
                );
                if (evalResponse.ok) {
                  const evalData = await evalResponse.json();
                  if (evalData.evaluation?.evaluation !== undefined) {
                    scoresMap.set(solution.statementId, evalData.evaluation.evaluation);
                  }
                }
              } catch (err) {
                console.error(`Failed to fetch evaluation for ${solution.statementId}:`, err);
              }
            })
          );

          setEvaluationScores(scoresMap);
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
  const evaluatedCount = useMemo(() => evaluationScores.size, [evaluationScores]);
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

  // Dispatch show-view-progress event when in survey context
  useEffect(() => {
    if (inSurveyContext) {
      const event = new CustomEvent('show-view-progress', {
        detail: { show: allEvaluatedIds.size > 0 }
      });
      window.dispatchEvent(event);
    }
  }, [allEvaluatedIds.size, inSurveyContext]);

  // Listen for trigger events from SurveyNavigation (when in survey context)
  useEffect(() => {
    if (!inSurveyContext) return;

    const handleTriggerAddSuggestion = () => {
      trackAddSolutionClick(questionId, userId);
      setShowSolutionPrompt(true);
    };

    const handleTriggerViewProgress = () => {
      setShowCompletionScreen(true);
    };

    window.addEventListener('trigger-add-suggestion', handleTriggerAddSuggestion);
    window.addEventListener('trigger-view-progress', handleTriggerViewProgress);

    return () => {
      window.removeEventListener('trigger-add-suggestion', handleTriggerAddSuggestion);
      window.removeEventListener('trigger-view-progress', handleTriggerViewProgress);
    };
  }, [inSurveyContext, questionId, userId]);

  // Handle opening the completion/progress screen manually
  const handleViewProgress = () => {
    setShowCompletionScreen(true);
  };

  /**
   * Handle evaluation of a solution
   */
  const handleEvaluate = async (solutionId: string, score: number) => {
    // Store previous score for rollback on error
    const previousScore = evaluationScores.get(solutionId);
    const wasAlreadyEvaluated = allEvaluatedIds.has(solutionId);

    try {
      // Optimistic update
      setEvaluationScores((prev) => {
        const newMap = new Map(prev);
        newMap.set(solutionId, score);
        return newMap;
      });
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

      // Track successful evaluation
      trackEvaluation(questionId, userId, solutionId, score);

      // Check if all options have been evaluated
      const newTotalEvaluated = allEvaluatedIds.size + (wasAlreadyEvaluated ? 0 : 1);
      if (totalOptionsCount > 0 && newTotalEvaluated >= totalOptionsCount) {
        setAllOptionsEvaluated(true);
      }
    } catch (error) {
      console.error('Evaluation error:', error);
      // Revert optimistic update
      setEvaluationScores((prev) => {
        const newMap = new Map(prev);
        if (previousScore !== undefined) {
          newMap.set(solutionId, previousScore);
        } else {
          newMap.delete(solutionId);
        }
        return newMap;
      });
      if (!wasAlreadyEvaluated) {
        setAllEvaluatedIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(solutionId);
          return newSet;
        });
      }
      setError('Failed to save your evaluation. Please try again.');
    }
  };

  /**
   * Fetch new batch of solutions using adaptive sampling
   * Server handles all filtering (evaluation history, stability, etc.)
   */
  const handleGetNewBatch = async () => {
    if (!canGetNewBatch || isLoadingBatch || allOptionsEvaluated) return;

    // Track new batch request
    trackNewBatchRequest(questionId, userId, batchCount + 1);

    setIsLoadingBatch(true);
    setError(null);

    try {
      // Server handles filtering - no need to send excludeIds
      const response = await fetch(`/api/statements/${questionId}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          size: 6,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch new batch');
      }

      const data = await response.json();

      // Log batch stats for debugging
      if (data.stats) {
        console.info('[SolutionFeedClient] Batch stats:', data.stats);
      }

      if (data.solutions && data.solutions.length > 0) {
        setSolutions(data.solutions);
        setEvaluationScores(new Map()); // Reset current batch tracking
        setBatchCount((prev) => prev + 1);

        // Update hasMore from server response
        if (!data.hasMore) {
          // This might be the last batch
          console.info('[SolutionFeedClient] Server indicates no more batches available');
        }
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
    // Server handles filtering - no need to send excludeIds
    setIsLoadingBatch(true);
    try {
      const response = await fetch(`/api/statements/${questionId}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          size: 6,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.solutions && data.solutions.length > 0) {
          setSolutions(data.solutions);
          setEvaluationScores(new Map());
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
            currentScore={evaluationScores.get(solution.statementId)}
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

        {/* Fixed Bottom Container - Progress & Actions (only show when NOT in survey context) */}
        {!inSurveyContext && (
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
              {/* Add Solution Button - only show if not in survey context */}
              <button
                className={styles.addSolutionButton}
                onClick={() => {
                  trackAddSolutionClick(questionId, userId);
                  setShowSolutionPrompt(true);
                }}
              >
                {t('Add Solution')}
              </button>
            </div>
          </div>
        )}

        {/* Solution prompt modal - used for both initial prompt and manual add */}
        <SolutionPromptModal
          isOpen={showSolutionPrompt}
          onClose={() => setShowSolutionPrompt(false)}
          questionId={questionId}
          userId={userId}
          onSubmitSuccess={handleSolutionComplete}
          questionText={question.statement}
          title={requiresSolution && !hasCheckedUserSolutions ? t('Add Your Solution First') : t('Add Solution')}
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
