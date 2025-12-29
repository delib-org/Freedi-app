'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import type { SurveyDemographicQuestion, DemographicOption } from '@freedi/shared-types';
import { UserDemographicQuestionType } from '@freedi/shared-types';
import styles from './Admin.module.scss';

interface DemographicQuestionEditorProps {
  question: SurveyDemographicQuestion;
  index: number;
  onUpdate: (updates: Partial<SurveyDemographicQuestion>) => void;
  onRemove: () => void;
}

const QUESTION_TYPES = [
  { value: 'text', labelKey: 'shortText' },
  { value: 'textarea', labelKey: 'longText' },
  { value: 'radio', labelKey: 'singleChoice' },
  { value: 'checkbox', labelKey: 'multipleChoice' },
] as const;

const DEFAULT_COLORS = [
  '#5f88e5', // Blue
  '#48bb78', // Green
  '#ed8936', // Orange
  '#e53e3e', // Red
  '#9f7aea', // Purple
  '#38b2ac', // Teal
  '#f56565', // Light Red
  '#4299e1', // Light Blue
];

/**
 * Editor for a single demographic question
 */
export default function DemographicQuestionEditor({
  question,
  index,
  onUpdate,
  onRemove,
}: DemographicQuestionEditorProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);

  const hasOptions =
    question.type === UserDemographicQuestionType.radio ||
    question.type === UserDemographicQuestionType.checkbox;

  const handleAddOption = () => {
    const currentOptions = question.options || [];
    const newOption: DemographicOption = {
      option: '',
      color: DEFAULT_COLORS[currentOptions.length % DEFAULT_COLORS.length],
    };
    onUpdate({ options: [...currentOptions, newOption] });
  };

  const handleUpdateOption = (optionIndex: number, updates: Partial<DemographicOption>) => {
    const currentOptions = question.options || [];
    const updatedOptions = currentOptions.map((opt, i) =>
      i === optionIndex ? { ...opt, ...updates } : opt
    );
    onUpdate({ options: updatedOptions });
  };

  const handleRemoveOption = (optionIndex: number) => {
    const currentOptions = question.options || [];
    onUpdate({ options: currentOptions.filter((_, i) => i !== optionIndex) });
  };

  const handleTypeChange = (newType: string) => {
    const type = newType as UserDemographicQuestionType;
    const updates: Partial<SurveyDemographicQuestion> = { type };

    // Initialize options if switching to radio/checkbox
    if (
      (type === UserDemographicQuestionType.radio ||
        type === UserDemographicQuestionType.checkbox) &&
      (!question.options || question.options.length === 0)
    ) {
      updates.options = [
        { option: '', color: DEFAULT_COLORS[0] },
        { option: '', color: DEFAULT_COLORS[1] },
      ];
    }

    onUpdate(updates);
  };

  return (
    <div className={styles.questionEditorCard}>
      <div
        className={styles.questionEditorHeader}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={styles.questionNumber}>{index + 1}</span>
        <span className={styles.questionPreview}>
          {question.question || t('untitledQuestion') || 'Untitled Question'}
        </span>
        <span className={styles.questionType}>
          {t(QUESTION_TYPES.find((qt) => qt.value === question.type)?.labelKey || 'shortText') || question.type}
        </span>
        <button
          type="button"
          className={styles.expandToggle}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? '▲' : '▼'}
        </button>
        <button
          type="button"
          className={styles.removeQuestionButton}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={t('removeQuestion') || 'Remove question'}
        >
          ×
        </button>
      </div>

      {isExpanded && (
        <div className={styles.questionEditorContent}>
          {/* Question Text */}
          <div className={styles.formGroup}>
            <label>{t('questionText') || 'Question'}</label>
            <input
              type="text"
              className={styles.textInput}
              value={question.question}
              onChange={(e) => onUpdate({ question: e.target.value })}
              placeholder={t('questionPlaceholder') || 'Enter your question...'}
            />
          </div>

          {/* Question Type */}
          <div className={styles.formGroup}>
            <label>{t('questionType') || 'Answer Type'}</label>
            <select
              className={styles.selectInput}
              value={question.type}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              {QUESTION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {t(type.labelKey) || type.labelKey}
                </option>
              ))}
            </select>
          </div>

          {/* Required toggle */}
          <div className={styles.formGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) => onUpdate({ required: e.target.checked })}
              />
              <span>{t('requiredQuestion') || 'Required question'}</span>
            </label>
          </div>

          {/* Options for radio/checkbox */}
          {hasOptions && (
            <div className={styles.optionsSection}>
              <label>{t('answerOptions') || 'Answer Options'}</label>

              {(question.options || []).length === 0 ? (
                <p className={styles.noOptions}>
                  {t('noOptionsYet') || 'No options added yet'}
                </p>
              ) : (
                <div className={styles.optionsList}>
                  {(question.options || []).map((option, optionIndex) => (
                    <div key={optionIndex} className={styles.optionRow}>
                      <input
                        type="color"
                        className={styles.colorPicker}
                        value={option.color || DEFAULT_COLORS[optionIndex % DEFAULT_COLORS.length]}
                        onChange={(e) =>
                          handleUpdateOption(optionIndex, { color: e.target.value })
                        }
                        title={t('optionColor') || 'Option color'}
                      />
                      <input
                        type="text"
                        className={styles.optionInput}
                        value={option.option}
                        onChange={(e) =>
                          handleUpdateOption(optionIndex, { option: e.target.value })
                        }
                        placeholder={`${t('option') || 'Option'} ${optionIndex + 1}`}
                      />
                      <button
                        type="button"
                        className={styles.removeOptionButton}
                        onClick={() => handleRemoveOption(optionIndex)}
                        aria-label={t('removeOption') || 'Remove option'}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                className={styles.addOptionButton}
                onClick={handleAddOption}
              >
                + {t('addOption') || 'Add Option'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
