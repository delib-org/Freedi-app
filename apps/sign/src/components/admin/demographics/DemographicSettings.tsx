'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import {
  DemographicMode,
  SurveyTriggerMode,
  SignDemographicQuestion,
  UserDemographicQuestionType,
  DemographicOption,
} from '@/types/demographics';
import styles from './DemographicSettings.module.scss';

interface DemographicSettingsProps {
  documentId: string;
  mode: DemographicMode;
  required: boolean;
  surveyTrigger: SurveyTriggerMode;
  onModeChange: (mode: DemographicMode) => void;
  onRequiredChange: (required: boolean) => void;
  onSurveyTriggerChange: (trigger: SurveyTriggerMode) => void;
}

// Auto-save demographic settings to Firestore
async function saveDemographicSettings(
  documentId: string,
  mode: DemographicMode,
  required: boolean,
  surveyTrigger: SurveyTriggerMode
): Promise<boolean> {
  try {
    const response = await fetch(`/api/admin/settings/${documentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        demographicMode: mode,
        demographicRequired: required,
        surveyTrigger,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to save demographic settings:', error);

    return false;
  }
}

export default function DemographicSettings({
  documentId,
  mode,
  required,
  surveyTrigger,
  onModeChange,
  onRequiredChange,
  onSurveyTriggerChange,
}: DemographicSettingsProps) {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState<SignDemographicQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [savingMode, setSavingMode] = useState(false);

  // New question form state
  const [newQuestion, setNewQuestion] = useState('');
  const [newType, setNewType] = useState<UserDemographicQuestionType>(UserDemographicQuestionType.text);
  const [newOptions, setNewOptions] = useState<DemographicOption[]>([]);
  const [newOptionText, setNewOptionText] = useState('');
  const [isRequired, setIsRequired] = useState(false);

  // Handle mode change with auto-save
  const handleModeChange = async (newMode: DemographicMode) => {
    onModeChange(newMode);

    // Auto-save the mode change so questions can be created immediately
    setSavingMode(true);
    const saved = await saveDemographicSettings(documentId, newMode, required, surveyTrigger);
    setSavingMode(false);

    if (!saved) {
      console.error('Failed to save demographic mode');
    }
  };

  // Handle required change with auto-save
  const handleRequiredChange = async (newRequired: boolean) => {
    onRequiredChange(newRequired);

    setSavingMode(true);
    const saved = await saveDemographicSettings(documentId, mode, newRequired, surveyTrigger);
    setSavingMode(false);

    if (!saved) {
      console.error('Failed to save demographic required setting');
    }
  };

  // Handle survey trigger change with auto-save
  const handleSurveyTriggerChange = async (newTrigger: SurveyTriggerMode) => {
    onSurveyTriggerChange(newTrigger);

    setSavingMode(true);
    const saved = await saveDemographicSettings(documentId, mode, required, newTrigger);
    setSavingMode(false);

    if (!saved) {
      console.error('Failed to save survey trigger setting');
    }
  };

  const fetchQuestions = useCallback(async () => {
    if (mode === 'disabled') {
      setQuestions([]);

      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/demographics/questions/${documentId}`);
      if (response.ok) {
        const data = await response.json();
        setQuestions(data.questions || []);
      }
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    } finally {
      setLoading(false);
    }
  }, [documentId, mode]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleAddOption = () => {
    if (newOptionText.trim()) {
      setNewOptions([...newOptions, { option: newOptionText.trim() }]);
      setNewOptionText('');
    }
  };

  const handleRemoveOption = (index: number) => {
    setNewOptions(newOptions.filter((_, i) => i !== index));
  };

  const handleCreateQuestion = async () => {
    if (!newQuestion.trim()) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/demographics/questions/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: newQuestion.trim(),
          type: newType,
          options: (newType === 'radio' || newType === 'checkbox') ? newOptions : [],
          required: isRequired,
        }),
      });

      if (response.ok) {
        // Reset form and refresh questions
        setNewQuestion('');
        setNewType(UserDemographicQuestionType.text);
        setNewOptions([]);
        setIsRequired(false);
        setShowEditor(false);
        await fetchQuestions();
      } else {
        const errorData = await response.json();
        console.error('Failed to create question:', errorData);
        alert(t('Failed to create question') + ': ' + (errorData.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to create question:', error);
      alert(t('Failed to create question'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm(t('Are you sure you want to delete this question?'))) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/demographics/questions/${documentId}/${questionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchQuestions();
      }
    } catch (error) {
      console.error('Failed to delete question:', error);
    } finally {
      setLoading(false);
    }
  };

  const modeOptions: { value: DemographicMode; label: string; description: string }[] = [
    {
      value: 'disabled',
      label: t('Disabled'),
      description: t('No demographic survey'),
    },
    {
      value: 'inherit',
      label: t('Use Main App'),
      description: t('Inherit questions from the main Freedi app'),
    },
    {
      value: 'custom',
      label: t('Custom Survey'),
      description: t('Create custom questions for this document'),
    },
  ];

  const questionTypes: { value: UserDemographicQuestionType; label: string }[] = [
    { value: UserDemographicQuestionType.text, label: t('Text Input') },
    { value: UserDemographicQuestionType.textarea, label: t('Text Area') },
    { value: UserDemographicQuestionType.radio, label: t('Single Choice') },
    { value: UserDemographicQuestionType.checkbox, label: t('Multiple Choice') },
  ];

  return (
    <div className={styles.demographicSettings}>
      {/* Mode Selection */}
      <div className={styles.modeSelector}>
        {modeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.modeOption} ${mode === option.value ? styles.active : ''}`}
            onClick={() => handleModeChange(option.value)}
            disabled={savingMode}
          >
            <span className={styles.modeLabel}>{option.label}</span>
            <span className={styles.modeDescription}>{option.description}</span>
          </button>
        ))}
      </div>
      {savingMode && (
        <p className={styles.savingText}>{t('Saving...')}</p>
      )}

      {/* Survey Trigger Mode (shown when demographics enabled) */}
      {mode !== 'disabled' && (
        <>
          {/* Required Survey Toggle */}
          <div className={styles.requiredRow}>
            <div className={styles.requiredInfo}>
              <p className={styles.requiredLabel}>{t('Required Survey')}</p>
              <p className={styles.requiredDescription}>
                {t('Users must complete the survey to interact with the document')}
              </p>
            </div>
            <button
              type="button"
              className={`${styles.toggle} ${required ? styles.active : ''}`}
              onClick={() => handleRequiredChange(!required)}
              aria-pressed={required}
              disabled={savingMode}
            />
          </div>

          {/* Survey Trigger Mode - only shown when required is enabled */}
          {required && (
            <div className={styles.triggerModeSection}>
              <p className={styles.triggerModeLabel}>{t('When should users complete the survey?')}</p>
              <div className={styles.triggerModeOptions}>
                <button
                  type="button"
                  className={`${styles.triggerOption} ${surveyTrigger === 'on_interaction' ? styles.active : ''}`}
                  onClick={() => handleSurveyTriggerChange('on_interaction')}
                  disabled={savingMode}
                >
                  <span className={styles.triggerOptionLabel}>{t('Before interacting')}</span>
                  <span className={styles.triggerOptionDescription}>
                    {t('Users can read the document freely. Survey appears when they try to approve, comment, or sign.')}
                  </span>
                  <span className={styles.triggerOptionBadge}>{t('Default')}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.triggerOption} ${surveyTrigger === 'before_viewing' ? styles.active : ''}`}
                  onClick={() => handleSurveyTriggerChange('before_viewing')}
                  disabled={savingMode}
                >
                  <span className={styles.triggerOptionLabel}>{t('Before viewing')}</span>
                  <span className={styles.triggerOptionDescription}>
                    {t('Users must complete the survey before accessing the document. Use for sensitive documents.')}
                  </span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Questions List */}
      {mode !== 'disabled' && (
        <div className={styles.questionsList}>
          <div className={styles.questionsHeader}>
            <h3 className={styles.questionsTitle}>
              {mode === 'inherit' ? t('Inherited Questions') : t('Custom Questions')}
            </h3>
            {mode === 'custom' && (
              <button
                type="button"
                className={styles.addButton}
                onClick={() => setShowEditor(!showEditor)}
              >
                {showEditor ? t('Cancel') : t('Add Question')}
              </button>
            )}
          </div>

          {loading ? (
            <p className={styles.loadingText}>{t('Loading...')}</p>
          ) : questions.length === 0 ? (
            <p className={styles.emptyText}>
              {mode === 'inherit'
                ? t('No inherited questions found. Configure them in the main Freedi app.')
                : t('No custom questions yet. Add your first question above.')}
            </p>
          ) : (
            <ul className={styles.questionsListItems}>
              {questions.map((question, index) => (
                <li key={question.userQuestionId || index} className={styles.questionItem}>
                  <div className={styles.questionInfo}>
                    <span className={styles.questionNumber}>{index + 1}.</span>
                    <div className={styles.questionContent}>
                      <p className={styles.questionText}>{question.question}</p>
                      <span className={styles.questionType}>
                        {questionTypes.find((qt) => qt.value === question.type)?.label || question.type}
                        {question.isInherited && (
                          <span className={styles.inheritedBadge}>{t('Inherited')}</span>
                        )}
                      </span>
                    </div>
                  </div>
                  {mode === 'custom' && !question.isInherited && (
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => handleDeleteQuestion(question.userQuestionId || '')}
                    >
                      {t('Delete')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Question Editor (only in custom mode) */}
      {mode === 'custom' && showEditor && (
        <div className={styles.questionEditor}>
          <h4 className={styles.editorTitle}>{t('Add New Question')}</h4>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t('Question Text')}</label>
            <input
              type="text"
              className={styles.formInput}
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder={t('Enter your question')}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t('Question Type')}</label>
            <select
              className={styles.formSelect}
              value={newType}
              onChange={(e) => {
                setNewType(e.target.value as UserDemographicQuestionType);
                if (e.target.value === 'text' || e.target.value === 'textarea') {
                  setNewOptions([]);
                }
              }}
            >
              {questionTypes.map((qt) => (
                <option key={qt.value} value={qt.value}>
                  {qt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Options for radio/checkbox */}
          {(newType === 'radio' || newType === 'checkbox') && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t('Options')}</label>
              <div className={styles.optionsList}>
                {newOptions.map((option, index) => (
                  <div key={index} className={styles.optionItem}>
                    <span>{option.option}</span>
                    <button
                      type="button"
                      className={styles.removeOptionButton}
                      onClick={() => handleRemoveOption(index)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className={styles.addOptionRow}>
                <input
                  type="text"
                  className={styles.formInput}
                  value={newOptionText}
                  onChange={(e) => setNewOptionText(e.target.value)}
                  placeholder={t('Add option')}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddOption()}
                />
                <button
                  type="button"
                  className={styles.addOptionButton}
                  onClick={handleAddOption}
                >
                  {t('Add')}
                </button>
              </div>
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
              />
              {t('This question is required')}
            </label>
          </div>

          <button
            type="button"
            className={styles.createButton}
            onClick={handleCreateQuestion}
            disabled={!newQuestion.trim() || loading}
          >
            {loading ? t('Creating...') : t('Create Question')}
          </button>
        </div>
      )}
    </div>
  );
}
