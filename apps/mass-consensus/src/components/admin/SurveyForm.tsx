'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Statement, QuestionOverrideSettings, SurveyDemographicPage, SurveyDemographicQuestion, SurveyExplanationPage } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import { Survey, CreateSurveyRequest, DEFAULT_SURVEY_SETTINGS } from '@/types/survey';
import QuestionPicker from './QuestionPicker';
import UnifiedFlowEditor from './UnifiedFlowEditor';
import LanguageSelector from './LanguageSelector';
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
  const { refreshToken } = useAuth();

  const [title, setTitle] = useState(existingSurvey?.title || '');
  const [description, setDescription] = useState(existingSurvey?.description || '');
  const [selectedQuestions, setSelectedQuestions] = useState<Statement[]>([]);
  const [settings, setSettings] = useState(existingSurvey?.settings || DEFAULT_SURVEY_SETTINGS);
  const [questionSettings, setQuestionSettings] = useState<Record<string, QuestionOverrideSettings>>(
    existingSurvey?.questionSettings || {}
  );
  const [defaultLanguage, setDefaultLanguage] = useState(existingSurvey?.defaultLanguage || '');
  const [forceLanguage, setForceLanguage] = useState(existingSurvey?.forceLanguage ?? true);
  const [demographicPages, setDemographicPages] = useState<SurveyDemographicPage[]>(
    existingSurvey?.demographicPages || []
  );
  const [explanationPages, setExplanationPages] = useState<SurveyExplanationPage[]>(
    existingSurvey?.explanationPages || []
  );
  const [customDemographicQuestions, setCustomDemographicQuestions] = useState<SurveyDemographicQuestion[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  const isEditing = !!existingSurvey;

  // Load existing questions when editing a survey
  const loadExistingQuestions = useCallback(async () => {
    if (!existingSurvey || existingSurvey.questionIds.length === 0) return;

    setIsLoadingQuestions(true);
    try {
      const token = await refreshToken();
      if (!token) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      // Fetch each question by ID
      const questionPromises = existingSurvey.questionIds.map(async (questionId) => {
        const response = await fetch(`/api/statements/${questionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          return data.statement as Statement;
        }
        return null;
      });

      const questions = await Promise.all(questionPromises);
      const validQuestions = questions.filter((q): q is Statement => q !== null);
      setSelectedQuestions(validQuestions);
    } catch (err) {
      console.error('[SurveyForm] Error loading questions:', err);
    } finally {
      setIsLoadingQuestions(false);
    }
  }, [existingSurvey, refreshToken, router]);

  useEffect(() => {
    loadExistingQuestions();
  }, [loadExistingQuestions]);

  // Load existing demographic questions when editing a survey
  const loadDemographicQuestions = useCallback(async () => {
    if (!existingSurvey) return;

    try {
      const token = await refreshToken();
      if (!token) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      const response = await fetch(`/api/surveys/${existingSurvey.surveyId}/demographics`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.questions && data.questions.length > 0) {
          setCustomDemographicQuestions(data.questions);
        }
      }
    } catch (err) {
      console.error('[SurveyForm] Error loading demographic questions:', err);
    }
  }, [existingSurvey, refreshToken, router]);

  useEffect(() => {
    loadDemographicQuestions();
  }, [loadDemographicQuestions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError(t('titleRequired'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const token = await refreshToken();

      if (!token) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      // Clean up questionSettings to only include selected questions
      const cleanedQuestionSettings: Record<string, QuestionOverrideSettings> = {};
      const selectedIds = new Set(selectedQuestions.map((q) => q.statementId));
      for (const [questionId, overrides] of Object.entries(questionSettings)) {
        if (selectedIds.has(questionId)) {
          cleanedQuestionSettings[questionId] = overrides;
        }
      }

      const surveyData: CreateSurveyRequest = {
        title: title.trim(),
        description: description.trim() || undefined,
        questionIds: selectedQuestions.map((q) => q.statementId),
        settings,
        questionSettings: cleanedQuestionSettings,
        defaultLanguage: defaultLanguage || undefined,
        forceLanguage: forceLanguage || undefined,
        demographicPages: demographicPages.length > 0 ? demographicPages : undefined,
        explanationPages: explanationPages.length > 0 ? explanationPages : undefined,
      };

      console.info('[SurveyForm] Submitting survey with questionSettings:', JSON.stringify(cleanedQuestionSettings));
      console.info('[SurveyForm] Full survey data:', JSON.stringify(surveyData));

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

      // Save demographic questions if there are any
      if (customDemographicQuestions.length > 0 || demographicPages.length > 0) {
        const demographicsResponse = await fetch(
          `/api/surveys/${survey.surveyId}/demographics`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              demographicPages,
              questions: customDemographicQuestions.map((q) => ({
                // Pass temp ID for new questions so API can map them
                questionId: q.questionId.startsWith('demo-q-') ? undefined : q.questionId,
                tempId: q.questionId.startsWith('demo-q-') ? q.questionId : undefined,
                question: q.question,
                type: q.type,
                options: q.options,
                order: q.order,
                required: q.required,
              })),
            }),
          }
        );

        if (!demographicsResponse.ok) {
          console.error('[SurveyForm] Failed to save demographic questions');
        }
      }

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
    // Also remove any per-question settings for the removed question
    setQuestionSettings((prev) => {
      const updated = { ...prev };
      delete updated[questionId];
      return updated;
    });
  };

  const handleQuestionSettingsChange = (
    questionId: string,
    overrides: QuestionOverrideSettings
  ) => {
    setQuestionSettings((prev) => ({
      ...prev,
      [questionId]: overrides,
    }));
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
        {isLoadingQuestions ? (
          <div className={styles.loadingQuestions}>
            <div className={styles.spinner} />
            <p>{t('loadingQuestions')}</p>
          </div>
        ) : (
          <QuestionPicker
            selectedQuestions={selectedQuestions}
            onQuestionsChange={handleQuestionsChange}
          />
        )}
      </div>

      {/* Step 3: Unified Flow Editor (Questions, Demographics, Explanations) */}
      {!isLoadingQuestions && (
        <div className={styles.formSection}>
          <h2 className={styles.sectionTitle}>{t('surveyFlow') || 'Survey Flow'}</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            {t('dragToReorderFlow') || 'Drag to reorder questions, demographics, and explanations. Click to expand settings.'}
          </p>
          <UnifiedFlowEditor
            questions={selectedQuestions}
            demographicPages={demographicPages}
            explanationPages={explanationPages}
            customDemographicQuestions={customDemographicQuestions}
            surveySettings={settings}
            questionSettings={questionSettings}
            onQuestionsChange={handleReorder}
            onDemographicPagesChange={setDemographicPages}
            onExplanationPagesChange={setExplanationPages}
            onCustomDemographicQuestionsChange={setCustomDemographicQuestions}
            onQuestionSettingsChange={handleQuestionSettingsChange}
            onRemoveQuestion={handleRemoveQuestion}
          />
        </div>
      )}

      {/* Step 4: Survey-Level Settings */}
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
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '1.5rem' }}>
            {t('allowSkippingNote') || 'When enabled, overrides all per-question skip settings'}
          </p>
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
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {t('minEvaluationsNote') || 'Default for all questions. Can be overridden per question.'}
          </p>
        </div>

        <div className={styles.formGroup}>
          <label>
            <input
              type="checkbox"
              checked={settings.allowParticipantsToAddSuggestions || false}
              onChange={(e) =>
                setSettings({ ...settings, allowParticipantsToAddSuggestions: e.target.checked })
              }
            />
            {' '}{t('allowParticipantsToAddSuggestions') || 'Allow participants to add suggestions'}
          </label>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '1.5rem' }}>
            {t('allowSuggestionsNote') || 'When enabled, overrides all per-question suggestion settings'}
          </p>
        </div>
      </div>

      {/* Step 5: Language Settings */}
      <div className={styles.formSection}>
        <h2 className={styles.sectionTitle}>{t('languageSettings') || 'Language Settings'}</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          {t('languageSettingsDescription') || 'Set the default language for this survey. RTL languages (Hebrew, Arabic) will automatically use right-to-left layout.'}
        </p>

        <div className={styles.languageSettings}>
          <div className={styles.formGroup}>
            <label>{t('defaultLanguage') || 'Default Language'}</label>
            <LanguageSelector
              currentLanguage={defaultLanguage}
              onChange={setDefaultLanguage}
            />
          </div>

          {defaultLanguage && (
            <div className={styles.forceLanguageRow}>
              <input
                id="forceLanguage"
                type="checkbox"
                checked={forceLanguage}
                onChange={(e) => setForceLanguage(e.target.checked)}
              />
              <label htmlFor="forceLanguage" className={styles.forceLanguageLabel}>
                <span className={styles.forceLanguageTitle}>
                  {t('forceSurveyLanguage') || 'Force survey language'}
                </span>
                <span className={styles.forceLanguageDescription}>
                  {t('forceSurveyLanguageDescription') || 'When enabled, all participants will see the survey in the selected language, overriding their browser preferences.'}
                </span>
              </label>
            </div>
          )}
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
