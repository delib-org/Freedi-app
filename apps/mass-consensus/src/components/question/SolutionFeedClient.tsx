'use client';

import { useState, useEffect, useRef } from 'react';
import { Statement } from '@freedi/shared-types';
import { MergedQuestionSettings } from '@/lib/utils/settingsUtils';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import { ToastProvider } from '@/components/shared/Toast';
import SolutionCard from './SolutionCard';
import SocialFeed from './SocialFeed';
import SolutionPromptModal from './SolutionPromptModal';
import CompletionScreen from '@/components/completion/CompletionScreen';
import styles from './SolutionFeed.module.css';
import { useTranslation } from '@freedi/shared-i18n/next';
import { logError } from '@/lib/utils/errorHandling';
import { getParagraphsText } from '@/lib/utils/paragraphUtils';
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
 * Client Component - Classic 6-card list view for solution evaluation
 * Shows all solutions in a scrollable list with inline rating buttons
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
  const [userSolutionCount, setUserSolutionCount] = useState(0);
  const [participantCount, setParticipantCount] = useState(0);
  const hasTrackedPageView = useRef(false);
  const userIdRef = useRef<string>('');

  const questionId = question.statementId;
  const totalOptionsCount = question.numberOfOptions || 0;

  // Use merged settings for "ask for suggestion before evaluation"
  const questionSettingsLegacy = question.questionSettings as { askUserForASolutionBeforeEvaluation?: boolean } | undefined;
  const requiresSolution = mergedSettings?.askUserForASolutionBeforeEvaluation ??
    questionSettingsLegacy?.askUserForASolutionBeforeEvaluation ?? true;

  console.info('[SolutionFeed Debug] Settings check:', {
    mergedSettings: mergedSettings?.askUserForASolutionBeforeEvaluation,
    questionSettingsLegacy: questionSettingsLegacy?.askUserForASolutionBeforeEvaluation,
    finalRequiresSolution: requiresSolution
  });

  // Check if we're in survey context (to hide bottomContainer)
  const inSurveyContext = !!mergedSettings;

  // Check if solutions array is empty
  const hasNoSolutions = solutions.length === 0;

  // Check if participants can add suggestions
  const canAddSuggestions = hasNoSolutions || (mergedSettings?.allowParticipantsToAddSuggestions ?? true);

  // Count how many solutions in the current batch have been evaluated
  const evaluatedInBatch = solutions.filter(
    s => evaluationScores.has(s.statementId) || allEvaluatedIds.has(s.statementId)
  ).length;
  const allBatchEvaluated = evaluatedInBatch >= solutions.length && solutions.length > 0;

  // Check if user has submitted solutions
  useEffect(() => {
    console.info('[SolutionFeed Debug] Effect triggered:', { userId, hasCheckedUserSolutions, requiresSolution });
    if (!userId || hasCheckedUserSolutions) return;

    const checkUserSolutions = async () => {
      try {
        console.info('[SolutionFeed Debug] Checking user solutions for questionId:', questionId);
        const response = await fetch(`/api/user-solutions/${questionId}?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          console.info('[SolutionFeed Debug] API response:', data);
          setHasSubmittedSolution(data.hasSubmitted);
          setUserSolutionCount(data.solutionCount || 0);

          if (inSurveyContext) {
            window.dispatchEvent(new CustomEvent('user-solution-count', {
              detail: { count: data.solutionCount || 0, questionId }
            }));
          }

          const shouldShowModal = !data.hasSubmitted && requiresSolution;
          console.info('[SolutionFeed Debug] Should show modal?', shouldShowModal, '(hasSubmitted:', data.hasSubmitted, 'requiresSolution:', requiresSolution, ')');
          if (shouldShowModal) {
            setShowSolutionPrompt(true);
          }
        }
        setHasCheckedUserSolutions(true);
      } catch (error) {
        logError(error, {
          operation: 'SolutionFeedClient.checkUserSolutions',
          metadata: { questionId },
        });
        setHasCheckedUserSolutions(true);
      }
    };

    checkUserSolutions();
  }, [userId, questionId, requiresSolution, hasCheckedUserSolutions, inSurveyContext]);

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
        logError(error, {
          operation: 'SolutionFeedClient.fetchParticipantCount',
          metadata: { questionId },
        });
      }
    };

    fetchParticipantCount();
  }, [questionId]);

  // Emit solutions count for navigation
  useEffect(() => {
    const event = new CustomEvent('solutions-loaded', {
      detail: { count: solutions.length, questionId }
    });
    window.dispatchEvent(event);

    const timeoutId = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('solutions-loaded', {
        detail: { count: solutions.length, questionId }
      }));
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [solutions.length, questionId]);

  // One-time initialization: user ID and page-view tracking
  useEffect(() => {
    const id = getOrCreateAnonymousUser();
    setUserId(id);
    userIdRef.current = id;

    if (!hasTrackedPageView.current) {
      trackPageView(questionId, id);
      hasTrackedPageView.current = true;
    }
  }, [questionId]);

  // Load evaluation history when questionId changes (not when solutions change)
  useEffect(() => {
    const id = userIdRef.current;
    if (!id) return;

    const loadEvaluationHistory = async () => {
      try {
        const response = await fetch(`/api/user-evaluations/${questionId}?userId=${id}`);
        if (response.ok) {
          const data = await response.json();
          const evaluatedSet = new Set<string>(data.evaluatedOptionsIds || []);
          setAllEvaluatedIds(evaluatedSet);

          if (totalOptionsCount > 0 && evaluatedSet.size >= totalOptionsCount) {
            setAllOptionsEvaluated(true);
          }

          // Fetch individual evaluation scores for already-evaluated solutions
          setSolutions((currentSolutions) => {
            // Fetch individual evaluation scores for solutions already evaluated
            const evaluatedSolutionsInBatch = currentSolutions.filter(solution =>
              evaluatedSet.has(solution.statementId)
            );

            if (evaluatedSolutionsInBatch.length > 0) {
              Promise.all(
                evaluatedSolutionsInBatch.map(async (solution) => {
                  try {
                    const evalResponse = await fetch(
                      `/api/evaluations/${solution.statementId}?userId=${id}`
                    );
                    if (evalResponse.ok) {
                      const evalData = await evalResponse.json();
                      if (evalData.evaluation?.evaluation !== undefined) {
                        return [solution.statementId, evalData.evaluation.evaluation as number] as const;
                      }
                    }
                  } catch (err) {
                    logError(err, {
                      operation: 'SolutionFeedClient.loadEvaluationHistory.fetchEvaluation',
                      metadata: { statementId: solution.statementId },
                    });
                  }
                  return null;
                })
              ).then((results) => {
                const scoresMap = new Map<string, number>();
                for (const result of results) {
                  if (result) {
                    scoresMap.set(result[0], result[1]);
                  }
                }
                setEvaluationScores(scoresMap);

                if (scoresMap.size > 0) {
                  window.dispatchEvent(new CustomEvent('evaluations-loaded', {
                    detail: { count: scoresMap.size, questionId }
                  }));
                }
              });
            }

            // Return unchanged solutions (we're just reading, not mutating)
            return currentSolutions;
          });
        }
      } catch (error) {
        logError(error, {
          operation: 'SolutionFeedClient.loadEvaluationHistory',
          metadata: { questionId },
        });
      }
    };

    loadEvaluationHistory();
  }, [questionId, totalOptionsCount]);

  // Listen for trigger events from SurveyNavigation
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

  // Dispatch show-view-progress event when in survey context
  useEffect(() => {
    if (inSurveyContext) {
      const event = new CustomEvent('show-view-progress', {
        detail: { show: allEvaluatedIds.size > 0 }
      });
      window.dispatchEvent(event);
    }
  }, [allEvaluatedIds.size, inSurveyContext]);

  /**
   * Handle evaluation from SolutionCard
   */
  const handleEvaluate = async (solutionId: string, score: number) => {
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

      trackEvaluation(questionId, userId, solutionId, score);

      if (!wasAlreadyEvaluated) {
        window.dispatchEvent(new CustomEvent('solution-evaluated', {
          detail: { solutionId, score, questionId }
        }));
      }

      const newTotalEvaluated = allEvaluatedIds.size + (wasAlreadyEvaluated ? 0 : 1);
      if (totalOptionsCount > 0 && newTotalEvaluated >= totalOptionsCount) {
        setAllOptionsEvaluated(true);
      }
    } catch (error) {
      logError(error, {
        operation: 'SolutionFeedClient.handleEvaluate',
        metadata: { questionId, solutionId, score },
      });
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
      setError(t('Failed to save your evaluation. Please try again.'));
    }
  };

  /**
   * Fetch new batch of solutions
   */
  const handleGetNewBatch = async () => {
    if (isLoadingBatch || allOptionsEvaluated) return;

    trackNewBatchRequest(questionId, userId, batchCount + 1);

    setIsLoadingBatch(true);
    setError(null);

    try {
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

      if (data.solutions && data.solutions.length > 0) {
        setSolutions(data.solutions);
        setEvaluationScores(new Map());
        setBatchCount((prev) => prev + 1);

        if (!data.hasMore) {
          console.info('[SolutionFeedClient] Server indicates no more batches available');
        }
      } else {
        setAllOptionsEvaluated(true);
      }
    } catch (error) {
      logError(error, {
        operation: 'SolutionFeedClient.handleGetNewBatch',
        metadata: { questionId, batchCount },
      });
      setError(t('Failed to load new solutions. Please try again.'));
    } finally {
      setIsLoadingBatch(false);
    }
  };

  /**
   * Handle solution flow completion
   */
  const handleSolutionComplete = async () => {
    setHasSubmittedSolution(true);
    const newCount = userSolutionCount + 1;
    setUserSolutionCount(newCount);

    if (inSurveyContext) {
      window.dispatchEvent(new CustomEvent('user-solution-count', {
        detail: { count: newCount, questionId }
      }));
    }

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
      logError(error, {
        operation: 'SolutionFeedClient.handleSolutionComplete',
        metadata: { questionId },
      });
    } finally {
      setIsLoadingBatch(false);
    }
  };

  const handleCompletionClose = () => {
    setShowCompletionScreen(false);
  };

  const handleViewProgress = () => {
    setShowCompletionScreen(true);
  };

  return (
    <ToastProvider>
      <div className={styles.feed}>
        {/* Error message */}
        {error && (
          <div className={styles.error}>
            <p>{error}</p>
            <button onClick={() => setError(null)}>{t('Dismiss')}</button>
          </div>
        )}

        {/* Empty state */}
        {hasNoSolutions ? (
          <div className={styles.emptyState}>
            <h3>{t('No solutions yet')}</h3>
            {canAddSuggestions ? (
              <>
                <p>{t('Be the first to submit a solution!')}</p>
                <button
                  className={styles.addSolutionButtonPrimary}
                  onClick={() => {
                    trackAddSolutionClick(questionId, userId);
                    setShowSolutionPrompt(true);
                  }}
                >
                  {t('Add Solution')}
                </button>
              </>
            ) : (
              <p>{t('Solutions will appear here once they are added.')}</p>
            )}
          </div>
        ) : (
          <>
            {/* Instructions */}
            <div className={styles.instructions}>
              <h3>{t('Please rate the following suggestions')}</h3>
              <p>{t('rateInstructions')}</p>
            </div>

            {/* Solution cards list */}
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
                <>
                  <p className={styles.hint}>
                    {tWithParams('You have evaluated all {{count}} available options', { count: totalOptionsCount })}
                  </p>
                  <button
                    className={styles.batchButton}
                    onClick={handleViewProgress}
                  >
                    {t('View Results')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`${styles.batchButton} ${!allBatchEvaluated ? styles.disabled : ''}`}
                    onClick={handleGetNewBatch}
                    disabled={isLoadingBatch || !allBatchEvaluated}
                  >
                    {isLoadingBatch
                      ? t('Loading...')
                      : `${t('Get New Suggestions')} (${evaluatedInBatch}/${solutions.length} ${t('evaluated')})`
                    }
                  </button>
                  {!allBatchEvaluated && (
                    <p className={styles.hint}>
                      {t('Rate all suggestions above to get new ones')}
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Action buttons - only show when NOT in survey context */}
        {!inSurveyContext && !hasNoSolutions && (
          <div className={styles.actionButtons}>
            {allEvaluatedIds.size > 0 && (
              <button
                className={styles.viewProgressButton}
                onClick={handleViewProgress}
              >
                {t('View Progress')}
              </button>
            )}
            {canAddSuggestions && (
              <button
                className={styles.addSolutionButton}
                onClick={() => {
                  trackAddSolutionClick(questionId, userId);
                  setShowSolutionPrompt(true);
                }}
              >
                {t('Add Solution')}
              </button>
            )}
          </div>
        )}

        {/* Social Feed - real-time activity */}
        <SocialFeed isActive={!hasNoSolutions} />

        {/* Solution prompt modal */}
        <SolutionPromptModal
          isOpen={showSolutionPrompt}
          onClose={() => setShowSolutionPrompt(false)}
          questionId={questionId}
          userId={userId}
          onSubmitSuccess={handleSolutionComplete}
          questionText={question.statement}
          questionDescription={getParagraphsText(question.paragraphs)}
          title={requiresSolution && !hasCheckedUserSolutions ? t('Add Your Solution First') : t('Add Solution')}
        />

        {/* Progress/Completion screen */}
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
