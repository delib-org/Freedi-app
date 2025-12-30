'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import type { SurveyDemographicPage, SurveyDemographicQuestion, SurveyDemographicAnswer } from '@freedi/shared-types';
import { UserDemographicQuestionType } from '@freedi/shared-types';
import { SurveyWithQuestions, getTotalFlowLength } from '@/types/survey';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import SurveyProgressBar from './SurveyProgress';
import styles from './Survey.module.scss';

interface SurveyDemographicPageProps {
  survey: SurveyWithQuestions;
  demographicPage: SurveyDemographicPage;
  questions: SurveyDemographicQuestion[];
  currentFlowIndex: number;
  existingAnswers?: SurveyDemographicAnswer[];
}

interface FormAnswers {
  [questionId: string]: {
    answer?: string;
    answerOptions?: string[];
  };
}

/**
 * User-facing component for displaying and collecting demographic question answers
 */
export default function SurveyDemographicPage({
  survey,
  demographicPage,
  questions,
  currentFlowIndex,
  existingAnswers = [],
}: SurveyDemographicPageProps) {
  const router = useRouter();
  const { t, tWithParams } = useTranslation();

  // Initialize answers from existing data
  const initialAnswers: FormAnswers = {};
  existingAnswers.forEach((answer) => {
    initialAnswers[answer.questionId] = {
      answer: answer.answer,
      answerOptions: answer.answerOptions,
    };
  });

  const [answers, setAnswers] = useState<FormAnswers>(initialAnswers);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ensure anonymous user ID is set on mount
  useEffect(() => {
    getOrCreateAnonymousUser();
  }, []);

  const totalFlowLength = getTotalFlowLength(survey);
  const isLastItem = currentFlowIndex === totalFlowLength - 1;

  const handleTextChange = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { answer: value },
    }));
    // Clear error when user starts typing
    if (errors[questionId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[questionId];

        return newErrors;
      });
    }
  }, [errors]);

  const handleRadioChange = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { answer: value },
    }));
    if (errors[questionId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[questionId];

        return newErrors;
      });
    }
  }, [errors]);

  const handleCheckboxChange = useCallback((questionId: string, value: string, checked: boolean) => {
    setAnswers((prev) => {
      const currentOptions = prev[questionId]?.answerOptions || [];
      const newOptions = checked
        ? [...currentOptions, value]
        : currentOptions.filter((opt) => opt !== value);

      return {
        ...prev,
        [questionId]: { answerOptions: newOptions },
      };
    });
    if (errors[questionId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[questionId];

        return newErrors;
      });
    }
  }, [errors]);

  const handleNumberChange = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { answer: value },
    }));
    if (errors[questionId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[questionId];

        return newErrors;
      });
    }
  }, [errors]);

  const validateAnswers = (): boolean => {
    const newErrors: Record<string, string> = {};

    questions.forEach((question) => {
      const answer = answers[question.questionId];
      const hasTextAnswer = answer?.answer && answer.answer.trim() !== '';
      const hasCheckboxAnswer = answer?.answerOptions && answer.answerOptions.length > 0;

      // Check required fields
      if (question.required) {
        if (
          question.type === UserDemographicQuestionType.checkbox &&
          !hasCheckboxAnswer
        ) {
          newErrors[question.questionId] = t('requiredField') || 'This field is required';

          return;
        } else if (
          question.type !== UserDemographicQuestionType.checkbox &&
          !hasTextAnswer
        ) {
          newErrors[question.questionId] = t('requiredField') || 'This field is required';

          return;
        }
      }

      // Validate numeric bounds for number and range types
      if (
        (question.type === UserDemographicQuestionType.number ||
          question.type === UserDemographicQuestionType.range) &&
        hasTextAnswer
      ) {
        const numValue = parseFloat(answer?.answer || '');

        if (isNaN(numValue)) {
          newErrors[question.questionId] = t('invalidNumber') || 'Please enter a valid number';

          return;
        }

        if (question.min !== undefined && numValue < question.min) {
          newErrors[question.questionId] =
            tWithParams('valueTooLow', { min: question.min }) ||
            `Value must be at least ${question.min}`;

          return;
        }

        if (question.max !== undefined && numValue > question.max) {
          newErrors[question.questionId] =
            tWithParams('valueTooHigh', { max: question.max }) ||
            `Value must be at most ${question.max}`;

          return;
        }
      }
    });

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateAnswers()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('firebase_token');
      const formattedAnswers = Object.entries(answers).map(([questionId, data]) => ({
        questionId,
        answer: data.answer,
        answerOptions: data.answerOptions,
      }));

      // Save answers to the API
      const response = await fetch(`/api/surveys/${survey.surveyId}/demographics/${demographicPage.demographicPageId}/answers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ answers: formattedAnswers }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save answers: ${response.status}`);
      }

      // Navigate to the next item in the flow
      if (isLastItem) {
        router.push(`/s/${survey.surveyId}/complete`);
      } else {
        router.push(`/s/${survey.surveyId}/q/${currentFlowIndex + 1}`);
      }
    } catch (error) {
      console.error('[SurveyDemographicPage] Error saving answers:', error);
      setErrors({ submit: t('errorSavingAnswers') || 'Failed to save answers. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (isLastItem) {
      router.push(`/s/${survey.surveyId}/complete`);
    } else {
      router.push(`/s/${survey.surveyId}/q/${currentFlowIndex + 1}`);
    }
  };

  const handleBack = () => {
    if (currentFlowIndex > 0 && survey.settings.allowReturning) {
      router.push(`/s/${survey.surveyId}/q/${currentFlowIndex - 1}`);
    }
  };

  const renderQuestion = (question: SurveyDemographicQuestion) => {
    const answer = answers[question.questionId];
    const error = errors[question.questionId];

    return (
      <div key={question.questionId} className={styles.demographicQuestion}>
        <label className={styles.questionLabel}>
          {question.question}
          {question.required && <span className={styles.required}>*</span>}
        </label>

        {question.type === UserDemographicQuestionType.text && (
          <input
            type="text"
            className={`${styles.questionInput} ${error ? styles.inputError : ''}`}
            value={answer?.answer || ''}
            onChange={(e) => handleTextChange(question.questionId, e.target.value)}
            placeholder={t('enterAnswer') || 'Enter your answer'}
          />
        )}

        {question.type === UserDemographicQuestionType.textarea && (
          <textarea
            className={`${styles.questionTextarea} ${error ? styles.inputError : ''}`}
            value={answer?.answer || ''}
            onChange={(e) => handleTextChange(question.questionId, e.target.value)}
            placeholder={t('enterAnswer') || 'Enter your answer'}
            rows={3}
          />
        )}

        {question.type === UserDemographicQuestionType.radio && (
          <div className={styles.optionsGroup}>
            {(question.options || []).map((option, idx) => (
              <label key={idx} className={styles.radioLabel}>
                <input
                  type="radio"
                  name={question.questionId}
                  value={option.option}
                  checked={answer?.answer === option.option}
                  onChange={() => handleRadioChange(question.questionId, option.option)}
                />
                <span
                  className={styles.optionText}
                  style={{ '--option-color': option.color } as React.CSSProperties}
                >
                  {option.option}
                </span>
              </label>
            ))}
          </div>
        )}

        {question.type === UserDemographicQuestionType.checkbox && (
          <div className={styles.optionsGroup}>
            {(question.options || []).map((option, idx) => (
              <label key={idx} className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  value={option.option}
                  checked={(answer?.answerOptions || []).includes(option.option)}
                  onChange={(e) =>
                    handleCheckboxChange(question.questionId, option.option, e.target.checked)
                  }
                />
                <span
                  className={styles.optionText}
                  style={{ '--option-color': option.color } as React.CSSProperties}
                >
                  {option.option}
                </span>
              </label>
            ))}
          </div>
        )}

        {question.type === UserDemographicQuestionType.range && (
          <div className={styles.rangeGroup}>
            <div className={styles.rangeLabels}>
              <span className={styles.rangeMinLabel}>
                {question.minLabel || question.min || 1}
              </span>
              <span className={styles.rangeValue}>
                {answer?.answer || question.min || 1}
              </span>
              <span className={styles.rangeMaxLabel}>
                {question.maxLabel || question.max || 10}
              </span>
            </div>
            <input
              type="range"
              className={styles.rangeInput}
              min={question.min ?? 1}
              max={question.max ?? 10}
              step={question.step ?? 1}
              value={answer?.answer || question.min || 1}
              onChange={(e) => handleNumberChange(question.questionId, e.target.value)}
            />
          </div>
        )}

        {question.type === UserDemographicQuestionType.number && (
          <input
            type="number"
            className={`${styles.questionInput} ${error ? styles.inputError : ''}`}
            min={question.min ?? undefined}
            max={question.max ?? undefined}
            step={question.step ?? 1}
            value={answer?.answer || ''}
            onChange={(e) => handleNumberChange(question.questionId, e.target.value)}
            placeholder={t('enterNumber') || 'Enter a number'}
          />
        )}

        {error && <span className={styles.errorMessage}>{error}</span>}
      </div>
    );
  };

  return (
    <div className={styles.questionWrapper}>
      <SurveyProgressBar
        currentIndex={currentFlowIndex}
        totalQuestions={totalFlowLength}
        completedIndices={[]}
        isDemographic
      />

      <div className={styles.demographicContent}>
        <div className={styles.demographicHeader}>
          <h1 className={styles.demographicTitle}>{demographicPage.title}</h1>
          {demographicPage.description && (
            <p className={styles.demographicDescription}>{demographicPage.description}</p>
          )}
        </div>

        <div className={styles.demographicQuestions}>
          {questions.map(renderQuestion)}
        </div>

        {errors.submit && (
          <div className={styles.submitError}>{errors.submit}</div>
        )}
      </div>

      <div className={styles.navContainer}>
        <div className={styles.navContent}>
          {survey.settings.allowReturning && currentFlowIndex > 0 && (
            <button
              type="button"
              className={`${styles.navButton} ${styles.back}`}
              onClick={handleBack}
            >
              {t('back') || 'Back'}
            </button>
          )}

          <div className={styles.navSpacer} />

          {!demographicPage.required && (
            <button
              type="button"
              className={`${styles.navButton} ${styles.back}`}
              onClick={handleSkip}
            >
              {t('skip') || 'Skip'}
            </button>
          )}

          <button
            type="button"
            className={`${styles.navButton} ${isLastItem ? styles.finish : styles.next}`}
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? t('saving') || 'Saving...'
              : isLastItem
              ? t('finish') || 'Finish'
              : t('next') || 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
