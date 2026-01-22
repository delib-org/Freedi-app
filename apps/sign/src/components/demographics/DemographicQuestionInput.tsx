'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { SignDemographicQuestion } from '@/types/demographics';
import styles from './DemographicQuestionInput.module.scss';

interface DemographicQuestionInputProps {
  question: SignDemographicQuestion;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  disabled?: boolean;
}

export default function DemographicQuestionInput({
  question,
  value,
  onChange,
  disabled = false,
}: DemographicQuestionInputProps) {
  const { t } = useTranslation();

  const handleTextChange = (newValue: string) => {
    onChange(newValue);
  };

  const handleRadioChange = (optionValue: string) => {
    onChange(optionValue);
  };

  const handleCheckboxChange = (optionValue: string, checked: boolean) => {
    const currentValues = Array.isArray(value) ? value : [];
    if (checked) {
      onChange([...currentValues, optionValue]);
    } else {
      onChange(currentValues.filter((v) => v !== optionValue));
    }
  };

  const renderInput = () => {
    switch (question.type) {
      case 'text':
        return (
          <input
            type="text"
            className={styles.textInput}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={t('Enter your answer')}
            disabled={disabled}
          />
        );

      case 'textarea':
        return (
          <textarea
            className={styles.textArea}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={t('Enter your answer')}
            disabled={disabled}
            rows={4}
          />
        );

      case 'radio':
        // Check if admin chose dropdown display
        if (question.displayType === 'dropdown') {
          return (
            <select
              className={styles.selectInput}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => handleRadioChange(e.target.value)}
              disabled={disabled}
            >
              <option value="">{t('Select an option')}</option>
              {question.options?.map((option, index) => (
                <option key={index} value={option.option}>
                  {option.option}
                </option>
              ))}
            </select>
          );
        }

        // Default: render radio buttons
        return (
          <div className={styles.optionsContainer}>
            {question.options?.map((option, index) => {
              const isSelected = value === option.option;

              return (
                <label
                  key={index}
                  className={`${styles.optionLabel} ${isSelected ? styles.selected : ''}`}
                  style={option.color && isSelected ? { borderColor: option.color, backgroundColor: `${option.color}15` } : undefined}
                >
                  <input
                    type="radio"
                    name={question.userQuestionId}
                    value={option.option}
                    checked={isSelected}
                    onChange={() => handleRadioChange(option.option)}
                    disabled={disabled}
                    className={styles.radioInput}
                  />
                  <span
                    className={styles.optionDot}
                    style={option.color ? { backgroundColor: isSelected ? option.color : undefined } : undefined}
                  />
                  <span className={styles.optionText}>{option.option}</span>
                </label>
              );
            })}
          </div>
        );

      case 'checkbox':
        const selectedValues = Array.isArray(value) ? value : [];

        return (
          <div className={styles.optionsContainer}>
            {question.options?.map((option, index) => {
              const isSelected = selectedValues.includes(option.option);

              return (
                <label
                  key={index}
                  className={`${styles.optionLabel} ${isSelected ? styles.selected : ''}`}
                  style={option.color && isSelected ? { borderColor: option.color, backgroundColor: `${option.color}15` } : undefined}
                >
                  <input
                    type="checkbox"
                    value={option.option}
                    checked={isSelected}
                    onChange={(e) => handleCheckboxChange(option.option, e.target.checked)}
                    disabled={disabled}
                    className={styles.checkboxInput}
                  />
                  <span
                    className={styles.checkboxBox}
                    style={option.color && isSelected ? { backgroundColor: option.color, borderColor: option.color } : undefined}
                  >
                    {isSelected && <span className={styles.checkmark}>✓</span>}
                  </span>
                  <span className={styles.optionText}>{option.option}</span>
                </label>
              );
            })}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.questionInput}>
      <label className={styles.questionLabel}>
        {question.question}
        {question.required && <span className={styles.requiredMark}>*</span>}
      </label>
      {question.isInherited && (
        <span className={styles.inheritedBadge}>{t('From main app')}</span>
      )}
      {renderInput()}
    </div>
  );
}
