'use client';

import { ReactNode, useState, useEffect } from 'react';
import { SurveyWithQuestions } from '@/types/survey';
import SurveyProgressBar from './SurveyProgress';
import SurveyNavigation from './SurveyNavigation';
import styles from './Survey.module.scss';

interface SurveyQuestionWrapperProps {
  survey: SurveyWithQuestions;
  currentIndex: number;
  children: ReactNode;
}

/**
 * Wrapper component that adds survey context (progress bar + navigation) to question pages
 */
export default function SurveyQuestionWrapper({
  survey,
  currentIndex,
  children,
}: SurveyQuestionWrapperProps) {
  // Track completed question indices (stored in localStorage for persistence)
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [evaluatedCount, setEvaluatedCount] = useState(0);
  const [actualSolutionsCount, setActualSolutionsCount] = useState(0);

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
  }, [currentIndex]);

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
        settings={survey.settings}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
