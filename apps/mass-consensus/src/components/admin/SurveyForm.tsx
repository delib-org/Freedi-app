'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Survey, CreateSurveyRequest, DEFAULT_SURVEY_SETTINGS } from '@/types/survey';
import QuestionPicker from './QuestionPicker';
import QuestionReorder from './QuestionReorder';
import styles from './Admin.module.scss';

interface SurveyFormProps {
  existingSurvey?: Survey;
}

/**
 * Form for creating or editing a survey
 */
export default function SurveyForm({ existingSurvey }: SurveyFormProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const [title, setTitle] = useState(existingSurvey?.title || '');
  const [description, setDescription] = useState(existingSurvey?.description || '');
  const [selectedQuestions, setSelectedQuestions] = useState<Statement[]>([]);
  const [settings, setSettings] = useState(existingSurvey?.settings || DEFAULT_SURVEY_SETTINGS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!existingSurvey;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError(t('titleRequired'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('firebase_token');

      if (!token) {
        setError('Please log in first');
        return;
      }

      const surveyData: CreateSurveyRequest = {
        title: title.trim(),
        description: description.trim() || undefined,
        questionIds: selectedQuestions.map((q) => q.statementId),
        settings,
      };

      const response = await fetch(
        isEditing ? `/api/surveys/${existingSurvey.surveyId}` : '/api/surveys',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(surveyData),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save survey');
      }

      const survey = await response.json();
      router.push(`/admin/surveys/${survey.surveyId}`);
    } catch (err) {
      console.error('[SurveyForm] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save survey');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuestionsChange = (questions: Statement[]) => {
    setSelectedQuestions(questions);
  };

  const handleReorder = (reorderedQuestions: Statement[]) => {
    setSelectedQuestions(reorderedQuestions);
  };

  const handleRemoveQuestion = (questionId: string) => {
    setSelectedQuestions((prev) =>
      prev.filter((q) => q.statementId !== questionId)
    );
  };

  return (
    <form className={styles.surveyForm} onSubmit={handleSubmit}>
      <div className={styles.formHeader}>
        <h1>{isEditing ? t('editSurvey') : t('createSurvey')}</h1>
        <p>{isEditing ? t('editSurveyDescription') : t('createSurveyDescription')}</p>
      </div>

      {error && (
        <div className={styles.error}>
          <p>{error}</p>
        </div>
      )}

      {/* Step 1: Basic Info */}
      <div className={styles.formSection}>
        <h2 className={styles.sectionTitle}>{t('basicInfo')}</h2>

        <div className={styles.formGroup}>
          <label htmlFor="title">{t('surveyTitle')}</label>
          <input
            id="title"
            type="text"
            className={styles.textInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('surveyTitlePlaceholder')}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="description">{t('surveyDescription')}</label>
          <textarea
            id="description"
            className={styles.textArea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('surveyDescriptionPlaceholder')}
          />
        </div>
      </div>

      {/* Step 2: Select Questions */}
      <div className={styles.formSection}>
        <h2 className={styles.sectionTitle}>{t('selectQuestions')}</h2>
        <QuestionPicker
          selectedQuestions={selectedQuestions}
          onQuestionsChange={handleQuestionsChange}
        />
      </div>

      {/* Step 3: Reorder Questions */}
      {selectedQuestions.length > 0 && (
        <div className={styles.formSection}>
          <h2 className={styles.sectionTitle}>{t('orderQuestions')}</h2>
          <QuestionReorder
            questions={selectedQuestions}
            onReorder={handleReorder}
            onRemove={handleRemoveQuestion}
          />
        </div>
      )}

      {/* Step 4: Settings */}
      <div className={styles.formSection}>
        <h2 className={styles.sectionTitle}>{t('surveySettings')}</h2>

        <div className={styles.formGroup}>
          <label>
            <input
              type="checkbox"
              checked={settings.allowSkipping}
              onChange={(e) =>
                setSettings({ ...settings, allowSkipping: e.target.checked })
              }
            />
            {' '}{t('allowSkipping')}
          </label>
        </div>

        <div className={styles.formGroup}>
          <label>
            <input
              type="checkbox"
              checked={settings.allowReturning}
              onChange={(e) =>
                setSettings({ ...settings, allowReturning: e.target.checked })
              }
            />
            {' '}{t('allowReturning')}
          </label>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="minEvaluations">{t('minEvaluationsPerQuestion')}</label>
          <input
            id="minEvaluations"
            type="number"
            className={styles.textInput}
            value={settings.minEvaluationsPerQuestion}
            onChange={(e) =>
              setSettings({
                ...settings,
                minEvaluationsPerQuestion: parseInt(e.target.value) || 3,
              })
            }
            min={1}
            max={10}
            style={{ width: '100px' }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className={styles.formActions}>
        <Link href="/admin/surveys" className={styles.cancelButton}>
          {t('cancel')}
        </Link>
        <button
          type="submit"
          className={styles.submitButton}
          disabled={isSubmitting || !title.trim()}
        >
          {isSubmitting
            ? t('saving')
            : isEditing
            ? t('saveChanges')
            : t('createSurvey')}
        </button>
      </div>
    </form>
  );
}
