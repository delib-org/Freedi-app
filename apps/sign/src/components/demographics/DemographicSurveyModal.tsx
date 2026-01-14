'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useDemographicStore } from '@/store/demographicStore';
import { DemographicAnswer } from '@/types/demographics';
import DemographicQuestionInput from './DemographicQuestionInput';
import styles from './DemographicSurveyModal.module.scss';

interface DemographicSurveyModalProps {
  documentId: string;
  isAdmin?: boolean;
}

export default function DemographicSurveyModal({
  documentId,
  isAdmin = false,
}: DemographicSurveyModalProps) {
  const { t } = useTranslation();

  const {
    questions,
    currentAnswers,
    setAnswer,
    isSurveyModalOpen,
    closeSurveyModal,
    isSubmitting,
    submitAnswers,
    fetchQuestions,
    fetchAnswers,
    status,
  } = useDemographicStore();

  const [localAnswers, setLocalAnswers] = useState<Record<string, string | string[]>>({});

  // Load questions and answers when modal opens
  useEffect(() => {
    if (isSurveyModalOpen && documentId) {
      fetchQuestions(documentId);
      fetchAnswers(documentId);
    }
  }, [isSurveyModalOpen, documentId, fetchQuestions, fetchAnswers]);

  // Sync local answers with store
  useEffect(() => {
    setLocalAnswers(currentAnswers);
  }, [currentAnswers]);

  const handleAnswerChange = useCallback(
    (questionId: string, value: string | string[]) => {
      setLocalAnswers((prev) => ({ ...prev, [questionId]: value }));
      setAnswer(questionId, value);
    },
    [setAnswer]
  );

  const handleSubmit = async () => {
    // Convert local answers to DemographicAnswer array
    const answers: DemographicAnswer[] = questions
      .filter((q) => q.userQuestionId)
      .map((q) => {
        const answer = localAnswers[q.userQuestionId!];

        return {
          userQuestionId: q.userQuestionId!,
          answer: typeof answer === 'string' ? answer : undefined,
          answerOptions: Array.isArray(answer) ? answer : undefined,
        };
      })
      .filter((a) => a.answer || (a.answerOptions && a.answerOptions.length > 0));

    const success = await submitAnswers(documentId, answers);
    if (success) {
      closeSurveyModal();
    }
  };

  const handleClose = async () => {
    // Only allow close if not required or if user is admin
    if (!status.isRequired || isAdmin) {
      // Save acknowledgement when dismissing (even without answers)
      // This marks the survey as "seen" so it won't show again
      await submitAnswers(documentId, []);
    }
  };

  // Calculate if form is complete
  const isFormComplete = questions.every((q) => {
    if (!q.required) return true;
    const answer = localAnswers[q.userQuestionId || ''];
    if (typeof answer === 'string') return answer.trim().length > 0;
    if (Array.isArray(answer)) return answer.length > 0;

    return false;
  });

  // Calculate answered count
  const answeredCount = questions.filter((q) => {
    const answer = localAnswers[q.userQuestionId || ''];
    if (typeof answer === 'string') return answer.trim().length > 0;
    if (Array.isArray(answer)) return answer.length > 0;

    return false;
  }).length;

  if (!isSurveyModalOpen) return null;

  // Group questions by inherited/custom
  const inheritedQuestions = questions.filter((q) => q.isInherited);
  const customQuestions = questions.filter((q) => !q.isInherited);

  return (
    <div className={`${styles.modalOverlay} ${status.isRequired ? styles.required : ''}`}>
      <div className={styles.modalContent}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <h2 className={styles.title}>{t('Complete Your Profile')}</h2>
            <p className={styles.subtitle}>
              {status.isRequired
                ? t('Please complete this survey to interact with the document')
                : t('Help us understand you better')}
            </p>
          </div>
          {(!status.isRequired || isAdmin) && (
            <button
              type="button"
              className={styles.closeButton}
              onClick={handleClose}
              aria-label={t('Close')}
            >
              ×
            </button>
          )}
        </header>

        {/* Progress Bar */}
        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${(answeredCount / questions.length) * 100}%` }}
            />
          </div>
          <span className={styles.progressText}>
            {answeredCount} {t('of')} {questions.length} {t('completed')}
          </span>
        </div>

        {/* Questions */}
        <div className={styles.questionsContainer}>
          {/* Inherited Questions Section */}
          {inheritedQuestions.length > 0 && (
            <section className={styles.questionSection}>
              {customQuestions.length > 0 && (
                <h3 className={styles.sectionTitle}>{t('Group Profile')}</h3>
              )}
              {inheritedQuestions.map((question, index) => (
                <div key={question.userQuestionId || index} className={styles.questionWrapper}>
                  <DemographicQuestionInput
                    question={question}
                    value={localAnswers[question.userQuestionId || ''] || ''}
                    onChange={(value) => handleAnswerChange(question.userQuestionId || '', value)}
                  />
                </div>
              ))}
            </section>
          )}

          {/* Custom Questions Section */}
          {customQuestions.length > 0 && (
            <section className={styles.questionSection}>
              {inheritedQuestions.length > 0 && (
                <h3 className={styles.sectionTitle}>{t('Document Questions')}</h3>
              )}
              {customQuestions.map((question, index) => (
                <div key={question.userQuestionId || index} className={styles.questionWrapper}>
                  <DemographicQuestionInput
                    question={question}
                    value={localAnswers[question.userQuestionId || ''] || ''}
                    onChange={(value) => handleAnswerChange(question.userQuestionId || '', value)}
                  />
                </div>
              ))}
            </section>
          )}
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleSubmit}
            disabled={isSubmitting || !isFormComplete}
          >
            {isSubmitting ? t('Submitting...') : t('Submit Survey')}
          </button>
          {!isFormComplete && (
            <p className={styles.formHint}>
              {t('Please answer all required questions')}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
