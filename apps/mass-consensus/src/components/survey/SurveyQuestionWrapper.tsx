'use client';

import { ReactNode, useState, useEffect, useCallback, useMemo } from 'react';
import { SurveyWithQuestions } from '@/types/survey';
import { MergedQuestionSettings } from '@/lib/utils/settingsUtils';
import SurveyProgressBar from './SurveyProgress';
import SurveyNavigation from './SurveyNavigation';
import { ConnectedWalletDisplay } from '@/components/fair-eval';
import styles from './Survey.module.scss';

interface SurveyQuestionWrapperProps {
  survey: SurveyWithQuestions;
  currentIndex: number;
  /** Total number of items in the flow (questions + demographics) */
  totalFlowItems: number;
  /** The actual question ID for this page (not derived from flow index) */
  questionId: string;
  children: ReactNode;
  /** Merged settings for the current question (survey + per-question overrides) */
  mergedSettings: MergedQuestionSettings;
}

// Custom event types for communication between components
declare global {
  interface WindowEventMap {
    'show-add-suggestion': CustomEvent<{ show: boolean }>;
    'show-view-progress': CustomEvent<{ show: boolean }>;
    'trigger-add-suggestion': CustomEvent;
    'trigger-view-progress': CustomEvent;
  }
}

/**
 * Wrapper component that adds survey context (progress bar + navigation) to question pages
 */
export default function SurveyQuestionWrapper({
  survey,
  currentIndex,
  totalFlowItems,
  questionId,
  children,
  mergedSettings,
}: SurveyQuestionWrapperProps) {
  // Track completed question indices (stored in localStorage for persistence)
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [evaluatedCount, setEvaluatedCount] = useState(0);
  const [actualSolutionsCount, setActualSolutionsCount] = useState(0);
  const [userSolutionCount, setUserSolutionCount] = useState(0);

  // Find the current question by ID (not by index, since flow includes demographics)
  const currentQuestion = useMemo(() =>
    survey.questions.find(q => q.statementId === questionId),
    [survey.questions, questionId]
  );

  // Debug logging for merged settings
  console.info('[SurveyQuestionWrapper] mergedSettings:', mergedSettings);
  console.info('[SurveyQuestionWrapper] allowParticipantsToAddSuggestions:', mergedSettings.allowParticipantsToAddSuggestions);
  console.info('[SurveyQuestionWrapper] askUserForASolutionBeforeEvaluation:', mergedSettings.askUserForASolutionBeforeEvaluation);

  // Action buttons state - use merged settings for current question
  const [showAddSuggestion, setShowAddSuggestion] = useState(
    mergedSettings.allowParticipantsToAddSuggestions
  );
  const [showViewProgress, setShowViewProgress] = useState(false);

  // Load progress from localStorage on mount
  useEffect(() => {
    const storageKey = `survey_progress_${survey.surveyId}`;
    const stored = localStorage.getItem(storageKey);

    if (stored) {
      try {
        const data = JSON.parse(stored);
        setCompletedIndices(data.completedIndices || []);
      } catch {
        console.error('[SurveyQuestionWrapper] Error parsing stored progress');
      }
    }
  }, [survey.surveyId]);

  // Listen for evaluation events to track count
  useEffect(() => {
    const handleEvaluation = (event: CustomEvent<{ questionId: string }>) => {
      // Only count evaluations for the current question
      if (event.detail.questionId === questionId) {
        setEvaluatedCount((prev) => prev + 1);
      }
    };

    // Listen for initial evaluation count (loaded from history)
    const handleInitialCount = (event: CustomEvent<{ count: number; questionId: string }>) => {
      if (event.detail.questionId === questionId) {
        setEvaluatedCount(event.detail.count);
      }
    };

    // Listen for custom evaluation event (dispatched from SolutionCard)
    window.addEventListener('solution-evaluated', handleEvaluation as EventListener);
    window.addEventListener('evaluations-loaded', handleInitialCount as EventListener);

    return () => {
      window.removeEventListener('solution-evaluated', handleEvaluation as EventListener);
      window.removeEventListener('evaluations-loaded', handleInitialCount as EventListener);
    };
  }, [questionId]);

  // Listen for solutions-loaded event to get actual available count
  useEffect(() => {
    const handleSolutionsLoaded = (event: CustomEvent<{ count: number; questionId: string }>) => {
      // Only update if the event is for the current question
      if (event.detail.questionId === questionId) {
        setActualSolutionsCount(event.detail.count);
      }
    };

    window.addEventListener('solutions-loaded', handleSolutionsLoaded as EventListener);

    return () => {
      window.removeEventListener('solutions-loaded', handleSolutionsLoaded as EventListener);
    };
  }, [questionId]);

  // Listen for user-solution-count event to track how many solutions this user has added
  useEffect(() => {
    const handleUserSolutionCount = (event: CustomEvent<{ count: number; questionId: string }>) => {
      if (event.detail.questionId === questionId) {
        setUserSolutionCount(event.detail.count);
      }
    };

    window.addEventListener('user-solution-count', handleUserSolutionCount as EventListener);

    return () => {
      window.removeEventListener('user-solution-count', handleUserSolutionCount as EventListener);
    };
  }, [questionId]);

  // Reset counts when question changes
  useEffect(() => {
    setEvaluatedCount(0);
    setActualSolutionsCount(0);
    setUserSolutionCount(0);
    setShowViewProgress(false);
    // Update showAddSuggestion based on merged settings for the new question
    setShowAddSuggestion(mergedSettings.allowParticipantsToAddSuggestions);
  }, [questionId, mergedSettings.allowParticipantsToAddSuggestions]);

  // Listen for show-view-progress events from SolutionFeedClient
  useEffect(() => {
    const handleShowViewProgress = (event: CustomEvent<{ show: boolean }>) => {
      setShowViewProgress(event.detail.show);
    };

    window.addEventListener('show-view-progress', handleShowViewProgress);
    return () => {
      window.removeEventListener('show-view-progress', handleShowViewProgress);
    };
  }, []);

  // Callbacks to trigger actions in SolutionFeedClient
  const handleAddSuggestion = useCallback(() => {
    window.dispatchEvent(new CustomEvent('trigger-add-suggestion'));
  }, []);

  const handleViewProgress = useCallback(() => {
    window.dispatchEvent(new CustomEvent('trigger-view-progress'));
  }, []);

  // Handle navigation - mark current question as completed
  const handleNavigate = (direction: 'back' | 'next') => {
    if (direction === 'next' && !completedIndices.includes(currentIndex)) {
      const newCompleted = [...completedIndices, currentIndex];
      setCompletedIndices(newCompleted);

      // Save to localStorage
      const storageKey = `survey_progress_${survey.surveyId}`;
      localStorage.setItem(storageKey, JSON.stringify({
        completedIndices: newCompleted,
        lastUpdated: Date.now(),
      }));

      // Save to server for statistics tracking
      const isLastQuestion = currentIndex === totalFlowItems - 1;
      fetch(`/api/surveys/${survey.surveyId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentQuestionIndex: currentIndex + 1,
          completedQuestionId: questionId,
          isCompleted: isLastQuestion,
        }),
      }).catch((error) => {
        console.error('[SurveyQuestionWrapper] Failed to save progress to server:', error);
      });
    }
  };

  // Get the topParentId for fair eval (use survey's parent or first question's topParent)
  const topParentId = useMemo(() => {
    if (currentQuestion?.topParentId) return currentQuestion.topParentId;
    if (survey.questions.length > 0) return survey.questions[0].topParentId;

    return survey.surveyId;
  }, [currentQuestion, survey.questions, survey.surveyId]);

  return (
    <div className={styles.questionWrapper}>
      <div className={styles.questionWrapperHeader}>
        <SurveyProgressBar
          currentIndex={currentIndex}
          totalQuestions={totalFlowItems}
          completedIndices={completedIndices}
        />

        {/* Show wallet display when fair evaluation is enabled */}
        {mergedSettings.enableFairEvaluation && (
          <ConnectedWalletDisplay
            topParentId={topParentId}
            size="small"
            compact
            className={styles.walletDisplay}
          />
        )}
      </div>

      <div className={styles.questionContent}>
        {children}
      </div>

      <SurveyNavigation
        surveyId={survey.surveyId}
        currentIndex={currentIndex}
        totalQuestions={totalFlowItems}
        evaluatedCount={evaluatedCount}
        availableOptionsCount={actualSolutionsCount || currentQuestion?.numberOfOptions || 0}
        userSolutionCount={userSolutionCount}
        mergedSettings={mergedSettings}
        allowReturning={survey.settings.allowReturning}
        onNavigate={handleNavigate}
        showAddSuggestion={showAddSuggestion}
        showViewProgress={showViewProgress}
        onAddSuggestion={handleAddSuggestion}
        onViewProgress={handleViewProgress}
      />
    </div>
  );
}
