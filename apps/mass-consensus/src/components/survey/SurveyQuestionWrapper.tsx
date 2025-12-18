'use client';

import { ReactNode, useState, useEffect, useCallback } from 'react';
import { SurveyWithQuestions } from '@/types/survey';
import { MergedQuestionSettings } from '@/lib/utils/settingsUtils';
import SurveyProgressBar from './SurveyProgress';
import SurveyNavigation from './SurveyNavigation';
import styles from './Survey.module.scss';

interface SurveyQuestionWrapperProps {
  survey: SurveyWithQuestions;
  currentIndex: number;
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
  children,
  mergedSettings,
}: SurveyQuestionWrapperProps) {
  // Track completed question indices (stored in localStorage for persistence)
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [evaluatedCount, setEvaluatedCount] = useState(0);
  const [actualSolutionsCount, setActualSolutionsCount] = useState(0);

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
    const handleEvaluation = () => {
      setEvaluatedCount((prev) => prev + 1);
    };

    // Listen for custom evaluation event (dispatched from SolutionCard)
    window.addEventListener('solution-evaluated', handleEvaluation);

    return () => {
      window.removeEventListener('solution-evaluated', handleEvaluation);
    };
  }, []);

  // Listen for solutions-loaded event to get actual available count
  useEffect(() => {
    const currentQuestionId = survey.questions[currentIndex]?.statementId;

    const handleSolutionsLoaded = (event: CustomEvent<{ count: number; questionId: string }>) => {
      // Only update if the event is for the current question
      if (event.detail.questionId === currentQuestionId) {
        setActualSolutionsCount(event.detail.count);
      }
    };

    window.addEventListener('solutions-loaded', handleSolutionsLoaded as EventListener);

    return () => {
      window.removeEventListener('solutions-loaded', handleSolutionsLoaded as EventListener);
    };
  }, [survey.questions, currentIndex]);

  // Reset evaluation count and solutions count when question changes
  useEffect(() => {
    setEvaluatedCount(0);
    setActualSolutionsCount(0);
    setShowViewProgress(false);
    // Update showAddSuggestion based on merged settings for the new question
    setShowAddSuggestion(mergedSettings.allowParticipantsToAddSuggestions);
  }, [currentIndex, mergedSettings.allowParticipantsToAddSuggestions]);

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
    }
  };

  return (
    <div className={styles.questionWrapper}>
      <SurveyProgressBar
        currentIndex={currentIndex}
        totalQuestions={survey.questions.length}
        completedIndices={completedIndices}
      />

      <div className={styles.questionContent}>
        {children}
      </div>

      <SurveyNavigation
        surveyId={survey.surveyId}
        currentIndex={currentIndex}
        totalQuestions={survey.questions.length}
        evaluatedCount={evaluatedCount}
        availableOptionsCount={actualSolutionsCount || survey.questions[currentIndex]?.numberOfOptions || 0}
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
