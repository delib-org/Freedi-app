'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import type { SurveyDemographicPage, UserDemographicQuestion } from '@freedi/shared-types';
import { UserDemographicQuestionType } from '@freedi/shared-types';
import { SurveyWithQuestions, getTotalFlowLength } from '@/types/survey';
import { getOrCreateAnonymousUser } from '@/lib/utils/user';
import { logError } from '@/lib/utils/errorHandling';
import SurveyProgressBar from './SurveyProgress';
import InlineMarkdown from '../shared/InlineMarkdown';
import styles from './Survey.module.scss';

const OTHER_SENTINEL = '__other__';

/**
 * Small spinner for use inside buttons during loading state
 */
function ButtonSpinner() {
  return (
    <span className={styles.buttonSpinner} role="status" aria-label="Loading">
      <svg
        className={styles.buttonSpinnerSvg}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          className={styles.buttonSpinnerCircle}
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

interface SurveyDemographicPageProps {
  survey: SurveyWithQuestions;
  demographicPage: SurveyDemographicPage;
  questions: UserDemographicQuestion[];
  currentFlowIndex: number;
  existingAnswers?: UserDemographicQuestion[];
}

interface FormAnswers {
  [questionId: string]: {
    answer?: string;
    answerOptions?: string[];
    otherText?: string;
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
    const qId = answer.userQuestionId || '';
    initialAnswers[qId] = {
      answer: answer.answer,
      answerOptions: answer.answerOptions,
    };
  });

  const [answers, setAnswers] = useState<FormAnswers>(initialAnswers);
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const otherInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const isNavigating = isSubmitting || isNavigatingBack || isSkipping;

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
      [questionId]: { answer: value, otherText: undefined },
    }));
    // Clear otherText when selecting a predefined option
    setOtherTexts((prev) => {
      const updated = { ...prev };
      delete updated[questionId];

      return updated;
    });
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

  const handleOtherTextChange = useCallback((questionId: string, text: string) => {
    setOtherTexts((prev) => ({ ...prev, [questionId]: text }));
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], otherText: text },
    }));
    if (errors[questionId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[questionId];

        return newErrors;
      });
    }
  }, [errors]);

  const handleOtherRadioSelect = useCallback((questionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { answer: OTHER_SENTINEL, otherText: otherTexts[questionId] || '' },
    }));
    if (errors[questionId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[questionId];

        return newErrors;
      });
    }
    setTimeout(() => {
      otherInputRefs.current[questionId]?.focus();
      otherInputRefs.current[questionId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }, [errors, otherTexts]);

  const handleOtherCheckboxToggle = useCallback((questionId: string, checked: boolean) => {
    setAnswers((prev) => {
      const currentOptions = prev[questionId]?.answerOptions || [];
      const newOptions = checked
        ? [...currentOptions, OTHER_SENTINEL]
        : currentOptions.filter((opt) => opt !== OTHER_SENTINEL);

      return {
        ...prev,
        [questionId]: {
          answerOptions: newOptions,
          otherText: checked ? (otherTexts[questionId] || '') : undefined,
        },
      };
    });
    if (!checked) {
      setOtherTexts((prev) => {
        const updated = { ...prev };
        delete updated[questionId];

        return updated;
      });
    }
    if (errors[questionId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[questionId];

        return newErrors;
      });
    }
    if (checked) {
      setTimeout(() => {
        otherInputRefs.current[questionId]?.focus();
        otherInputRefs.current[questionId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }, [errors, otherTexts]);

  const validateAnswers = (): boolean => {
    const newErrors: Record<string, string> = {};

    questions.forEach((question) => {
      const answer = answers[question.userQuestionId || ''];
      const hasTextAnswer = answer?.answer && answer.answer.trim() !== '';
      const hasCheckboxAnswer = answer?.answerOptions && answer.answerOptions.length > 0;

      // Check required fields
      if (question.required) {
        if (
          question.type === UserDemographicQuestionType.checkbox &&
          !hasCheckboxAnswer
        ) {
          newErrors[question.userQuestionId || ''] = t('requiredField') || 'This field is required';

          return;
        } else if (
          question.type !== UserDemographicQuestionType.checkbox &&
          !hasTextAnswer
        ) {
          newErrors[question.userQuestionId || ''] = t('requiredField') || 'This field is required';

          return;
        }
      }

      // Validate "Other" text when Other is selected
      if (question.allowOther) {
        const qId = question.userQuestionId || '';
        if (
          question.type === UserDemographicQuestionType.radio &&
          answer?.answer === OTHER_SENTINEL
        ) {
          const text = otherTexts[qId] || '';
          if (!text.trim()) {
            newErrors[qId] = t('Please specify your answer') || 'Please specify your answer';

            return;
          }
        }
        if (
          question.type === UserDemographicQuestionType.checkbox &&
          answer?.answerOptions?.includes(OTHER_SENTINEL)
        ) {
          const text = otherTexts[qId] || '';
          if (!text.trim()) {
            newErrors[qId] = t('Please specify your answer') || 'Please specify your answer';

            return;
          }
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
          newErrors[question.userQuestionId || ''] = t('invalidNumber') || 'Please enter a valid number';

          return;
        }

        if (question.min !== undefined && numValue < question.min) {
          newErrors[question.userQuestionId || ''] =
            tWithParams('valueTooLow', { min: question.min }) ||
            `Value must be at least ${question.min}`;

          return;
        }

        if (question.max !== undefined && numValue > question.max) {
          newErrors[question.userQuestionId || ''] =
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
    if (isNavigating) return; // Prevent double-clicks
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
        otherText: data.otherText || otherTexts[questionId] || undefined,
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

      // Save progress to server for statistics tracking
      fetch(`/api/surveys/${survey.surveyId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentQuestionIndex: currentFlowIndex + 1,
          isCompleted: isLastItem,
        }),
      }).catch((error) => {
        logError(error, {
          operation: 'SurveyDemographicPage.saveProgress',
          metadata: { surveyId: survey.surveyId },
        });
      });

      // Navigate to the next item in the flow
      if (isLastItem) {
        router.push(`/s/${survey.surveyId}/complete`);
      } else {
        router.push(`/s/${survey.surveyId}/q/${currentFlowIndex + 1}`);
      }
    } catch (error) {
      logError(error, {
        operation: 'SurveyDemographicPage.handleSubmit',
        metadata: { surveyId: survey.surveyId },
      });
      setErrors({ submit: t('errorSavingAnswers') || 'Failed to save answers. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = useCallback(() => {
    if (isNavigating) return; // Prevent double-clicks
    setIsSkipping(true);

    // Save progress to server for statistics tracking (even when skipping)
    fetch(`/api/surveys/${survey.surveyId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        currentQuestionIndex: currentFlowIndex + 1,
        isCompleted: isLastItem,
      }),
    }).catch((error) => {
      logError(error, {
        operation: 'SurveyDemographicPage.handleNext.saveProgress',
        metadata: { surveyId: survey.surveyId, currentFlowIndex },
      });
    });

    if (isLastItem) {
      router.push(`/s/${survey.surveyId}/complete`);
    } else {
      router.push(`/s/${survey.surveyId}/q/${currentFlowIndex + 1}`);
    }
  }, [isNavigating, isLastItem, router, survey.surveyId, currentFlowIndex]);

  const handleBack = useCallback(() => {
    if (isNavigating) return; // Prevent double-clicks
    if (currentFlowIndex > 0 && survey.settings.allowReturning) {
      setIsNavigatingBack(true);
      router.push(`/s/${survey.surveyId}/q/${currentFlowIndex - 1}`);
    }
  }, [isNavigating, currentFlowIndex, survey.settings.allowReturning, router, survey.surveyId]);

  const renderQuestion = (question: UserDemographicQuestion) => {
    const answer = answers[question.userQuestionId || ''];
    const error = errors[question.userQuestionId || ''];

    return (
      <div key={question.userQuestionId || ''} className={styles.demographicQuestion}>
        <label className={styles.questionLabel}>
          <InlineMarkdown text={question.question} />
          {question.required && <span className={styles.required}>*</span>}
        </label>

        {question.type === UserDemographicQuestionType.text && (
          <input
            type="text"
            className={`${styles.questionInput} ${error ? styles.inputError : ''}`}
            value={answer?.answer || ''}
            onChange={(e) => handleTextChange(question.userQuestionId || '', e.target.value)}
            placeholder={t('enterAnswer') || 'Enter your answer'}
          />
        )}

        {question.type === UserDemographicQuestionType.textarea && (
          <textarea
            className={`${styles.questionTextarea} ${error ? styles.inputError : ''}`}
            value={answer?.answer || ''}
            onChange={(e) => handleTextChange(question.userQuestionId || '', e.target.value)}
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
                  name={question.userQuestionId || ''}
                  value={option.option}
                  checked={answer?.answer === option.option}
                  onChange={() => handleRadioChange(question.userQuestionId || '', option.option)}
                />
                <span
                  className={styles.optionText}
                  style={{ '--option-color': option.color } as React.CSSProperties}
                >
                  <InlineMarkdown text={option.option} />
                </span>
              </label>
            ))}
            {question.allowOther && (() => {
              const qId = question.userQuestionId || '';
              const isOtherSelected = answer?.answer === OTHER_SENTINEL;
              const showOtherError = isOtherSelected && question.required && !(otherTexts[qId] || '').trim();

              return (
                <div className={styles.otherOptionWrapper}>
                  <label className={`${styles.radioLabel} ${styles.otherRadioLabel} ${isOtherSelected ? styles.otherSelected : ''}`}>
                    <input
                      type="radio"
                      name={qId}
                      value={OTHER_SENTINEL}
                      checked={isOtherSelected}
                      onChange={() => handleOtherRadioSelect(qId)}
                    />
                    <span className={styles.optionText}>
                      {t('Other') || 'Other'}
                    </span>
                  </label>
                  <div className={`${styles.otherInputWrapper} ${isOtherSelected ? styles.otherInputVisible : ''}`}>
                    <input
                      ref={(el) => { otherInputRefs.current[qId] = el; }}
                      type="text"
                      value={otherTexts[qId] || ''}
                      onChange={(e) => handleOtherTextChange(qId, e.target.value)}
                      placeholder={t('Please specify...') || 'Please specify...'}
                      className={`${styles.otherTextInput} ${showOtherError ? styles.otherTextInputError : ''}`}
                      aria-label={t('Please specify your answer') || 'Please specify your answer'}
                      tabIndex={isOtherSelected ? 0 : -1}
                    />
                    {showOtherError && (
                      <span className={styles.otherErrorMessage}>
                        {t('Please specify your answer') || 'Please specify your answer'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
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
                    handleCheckboxChange(question.userQuestionId || '', option.option, e.target.checked)
                  }
                />
                <span
                  className={styles.optionText}
                  style={{ '--option-color': option.color } as React.CSSProperties}
                >
                  <InlineMarkdown text={option.option} />
                </span>
              </label>
            ))}
            {question.allowOther && (() => {
              const qId = question.userQuestionId || '';
              const isOtherChecked = (answer?.answerOptions || []).includes(OTHER_SENTINEL);
              const showOtherError = isOtherChecked && question.required && !(otherTexts[qId] || '').trim();

              return (
                <div className={styles.otherOptionWrapper}>
                  <label className={`${styles.checkboxLabel} ${styles.otherCheckboxLabel} ${isOtherChecked ? styles.otherSelected : ''}`}>
                    <input
                      type="checkbox"
                      value={OTHER_SENTINEL}
                      checked={isOtherChecked}
                      onChange={(e) => handleOtherCheckboxToggle(qId, e.target.checked)}
                    />
                    <span className={styles.optionText}>
                      {t('Other') || 'Other'}
                    </span>
                  </label>
                  <div className={`${styles.otherInputWrapper} ${isOtherChecked ? styles.otherInputVisible : ''}`}>
                    <input
                      ref={(el) => { otherInputRefs.current[qId] = el; }}
                      type="text"
                      value={otherTexts[qId] || ''}
                      onChange={(e) => handleOtherTextChange(qId, e.target.value)}
                      placeholder={t('Please specify...') || 'Please specify...'}
                      className={`${styles.otherTextInput} ${showOtherError ? styles.otherTextInputError : ''}`}
                      aria-label={t('Please specify your answer') || 'Please specify your answer'}
                      tabIndex={isOtherChecked ? 0 : -1}
                    />
                    {showOtherError && (
                      <span className={styles.otherErrorMessage}>
                        {t('Please specify your answer') || 'Please specify your answer'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {question.type === UserDemographicQuestionType.range && (
          <div className={styles.rangeGroup}>
            <div className={styles.rangeValueDisplay}>
              <span className={styles.rangeValue}>
                {answer?.answer || question.min || 1}
              </span>
            </div>
            <div className={styles.rangeSliderRow}>
              <span className={styles.rangeMinLabel}>
                {question.minLabel || question.min || 1}
              </span>
              <input
                type="range"
                className={styles.rangeInput}
                min={question.min ?? 1}
                max={question.max ?? 10}
                step={question.step ?? 1}
                value={answer?.answer || question.min || 1}
                onChange={(e) => handleNumberChange(question.userQuestionId || '', e.target.value)}
              />
              <span className={styles.rangeMaxLabel}>
                {question.maxLabel || question.max || 10}
              </span>
            </div>
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
            onChange={(e) => handleNumberChange(question.userQuestionId || '', e.target.value)}
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
              className={`${styles.navButton} ${styles.back} ${isNavigatingBack ? styles.loading : ''}`}
              onClick={handleBack}
              disabled={isNavigating}
              aria-busy={isNavigatingBack}
              aria-label={isNavigatingBack ? (t('loading') || 'Loading') : (t('back') || 'Back')}
            >
              {isNavigatingBack ? <ButtonSpinner /> : (t('back') || 'Back')}
            </button>
          )}

          <div className={styles.navSpacer} />

          {!demographicPage.required && (
            <button
              type="button"
              className={`${styles.navButton} ${styles.back} ${isSkipping ? styles.loading : ''}`}
              onClick={handleSkip}
              disabled={isNavigating}
              aria-busy={isSkipping}
              aria-label={isSkipping ? (t('loading') || 'Loading') : (t('skip') || 'Skip')}
            >
              {isSkipping ? <ButtonSpinner /> : (t('skip') || 'Skip')}
            </button>
          )}

          <button
            type="button"
            className={`${styles.navButton} ${isLastItem ? styles.finish : styles.next} ${isSubmitting ? styles.loading : ''}`}
            onClick={handleSubmit}
            disabled={isNavigating}
            aria-busy={isSubmitting}
            aria-label={isSubmitting ? (t('loading') || 'Loading') : (isLastItem ? t('finish') || 'Finish' : t('next') || 'Next')}
          >
            {isSubmitting ? (
              <ButtonSpinner />
            ) : (
              isLastItem ? t('finish') || 'Finish' : t('next') || 'Next'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
