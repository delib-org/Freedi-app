import { UserDemographicQuestion, UserDemographicQuestionType } from '@freedi/shared-types';
import { FC, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './UserDemographicQuestionInput.module.scss';

const OTHER_SENTINEL = '__other__';

interface UserDemographicQuestionInputProps {
	question: UserDemographicQuestion;
	value?: string | string[];
	options?: { option: string; color?: string }[];
	onChange: (value: string | string[]) => void;
	onOtherTextChange?: (questionId: string, text: string) => void;
	otherText?: string;
	className?: string;
	required?: boolean;
}

const UserDemographicQuestionInput: FC<UserDemographicQuestionInputProps> = ({
	question,
	value = '',
	onChange,
	onOtherTextChange,
	otherText = '',
	className = '',
	required = false,
}) => {
	const { t } = useTranslation();
	const [validationError, setValidationError] = useState('');
	const [, setIsChosen] = useState<number | null>(null);
	const otherInputRef = useRef<HTMLInputElement>(null);

	const isOtherSelectedRadio = value === OTHER_SENTINEL;
	const isOtherSelectedCheckbox = Array.isArray(value) && value.includes(OTHER_SENTINEL);

	const validateInput = (inputValue: string | string[]) => {
		if (!required) {
			setValidationError('');

			return true;
		}

		switch (question.type) {
			case UserDemographicQuestionType.text:
			case UserDemographicQuestionType.textarea:
			case UserDemographicQuestionType.radio:
			case UserDemographicQuestionType.dropdown:
				if (!inputValue || (typeof inputValue === 'string' && inputValue.trim() === '')) {
					setValidationError(`- ${t('This field is required')}`);

					return false;
				}
				break;
			case UserDemographicQuestionType.checkbox:
				if (!Array.isArray(inputValue) || inputValue.length === 0) {
					setValidationError(`- ${t('Please select at least one option')}`);

					return false;
				}
				break;
		}

		setValidationError('');

		return true;
	};

	const handleRadioChange = (selectedValue: string, index: number) => {
		validateInput(selectedValue);
		onChange(selectedValue);
		setIsChosen(index);

		if (selectedValue !== OTHER_SENTINEL && onOtherTextChange) {
			onOtherTextChange(question.userQuestionId || '', '');
		}
	};

	const handleOtherRadioSelect = () => {
		validateInput(OTHER_SENTINEL);
		onChange(OTHER_SENTINEL);
		setIsChosen(null);
		setTimeout(() => {
			otherInputRef.current?.focus();
			otherInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}, 50);
	};

	const handleOtherCheckboxToggle = (checked: boolean) => {
		const currentValues = Array.isArray(value) ? value : [];
		const newValues = checked
			? [...currentValues, OTHER_SENTINEL]
			: currentValues.filter((v) => v !== OTHER_SENTINEL);

		if (!checked && onOtherTextChange) {
			onOtherTextChange(question.userQuestionId || '', '');
		}

		validateInput(newValues);
		onChange(newValues);

		if (checked) {
			setTimeout(() => {
				otherInputRef.current?.focus();
				otherInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}, 50);
		}
	};

	// Validate on mount and when value/required changes
	useEffect(() => {
		if (required) {
			validateInput(value);
		}
	}, [value, required]);

	const renderOtherOption = (type: 'radio' | 'checkbox') => {
		if (!question.allowOther) return null;

		const isSelected = type === 'radio' ? isOtherSelectedRadio : isOtherSelectedCheckbox;
		const showOtherError = isSelected && required && !otherText.trim();

		return (
			<div className={styles.otherOptionWrapper}>
				<label
					className={`${styles.optionLabel} ${styles.otherOptionLabel} ${isSelected ? styles.optionLabelSelected : ''}`}
				>
					<input
						type={type}
						name={
							type === 'radio'
								? `radio-${question.userQuestionId}`
								: `checkbox-${question.userQuestionId}`
						}
						value={OTHER_SENTINEL}
						checked={isSelected}
						onChange={
							type === 'radio'
								? handleOtherRadioSelect
								: (e) => handleOtherCheckboxToggle(e.target.checked)
						}
						className={type === 'radio' ? styles.radioInput : styles.checkboxInput}
					/>
					<span className={`${styles.optionText} ${isSelected ? styles.selectedInput : ''}`}>
						{t('Other')}
					</span>
				</label>
				<div
					className={`${styles.otherInputWrapper} ${isSelected ? styles.otherInputVisible : ''}`}
				>
					<input
						ref={otherInputRef}
						type="text"
						value={otherText}
						onChange={(e) => onOtherTextChange?.(question.userQuestionId || '', e.target.value)}
						placeholder={t('Please specify...')}
						className={`${styles.otherTextInput} ${showOtherError ? styles.otherTextInputError : ''}`}
						aria-label={t('Please specify your answer')}
						tabIndex={isSelected ? 0 : -1}
					/>
					{showOtherError && (
						<span className={styles.otherErrorMessage}>{t('Please specify your answer')}</span>
					)}
				</div>
			</div>
		);
	};

	const renderInput = () => {
		switch (question.type) {
			case UserDemographicQuestionType.text:
				return (
					<input
						type="text"
						value={typeof value === 'string' ? value : ''}
						onChange={(e) => {
							const newValue = e.target.value;
							validateInput(newValue);
							onChange(newValue);
						}}
						placeholder={t('Enter your answer')}
						className={styles.textInput}
						required={required}
						aria-required={required}
						aria-invalid={!!validationError}
						aria-describedby={validationError ? `${question.userQuestionId}-error` : undefined}
					/>
				);

			case UserDemographicQuestionType.textarea:
				return (
					<textarea
						value={typeof value === 'string' ? value : ''}
						onChange={(e) => {
							const newValue = e.target.value;
							validateInput(newValue);
							onChange(newValue);
						}}
						placeholder={t('Enter your detailed answer')}
						className={styles.textareaInput}
						rows={4}
						required={required}
						aria-required={required}
						aria-invalid={!!validationError}
						aria-describedby={validationError ? `${question.userQuestionId}-error` : undefined}
					/>
				);

			case UserDemographicQuestionType.checkbox:
				return (
					<div className={styles.optionsContainer} role="group" aria-required={required}>
						{question.options?.map((option, index) => {
							const isChecked = Array.isArray(value) && value.includes(option.option);

							return (
								<label
									key={index}
									className={`${styles.optionLabel} ${isChecked ? styles.optionLabelSelected : ''}`}
								>
									<input
										type="checkbox"
										name={`checkbox-${question.userQuestionId}`}
										value={option.option}
										checked={isChecked}
										onChange={(e) => {
											const newValue = e.target.checked
												? Array.isArray(value)
													? [...value, option.option]
													: [option.option]
												: Array.isArray(value)
													? value.filter((v) => v !== option.option)
													: [];
											validateInput(newValue);
											onChange(newValue);
										}}
										className={styles.checkboxInput}
									/>
									<span className={`${styles.optionText} ${isChecked ? styles.selectedInput : ''}`}>
										{option.option}
									</span>
								</label>
							);
						})}
						{renderOtherOption('checkbox')}
					</div>
				);

			case UserDemographicQuestionType.radio:
				return (
					<div className={styles.optionsContainer} role="radiogroup" aria-required={required}>
						{question.options?.map((option, index) => {
							const isSelected = value === option.option;

							return (
								<label
									key={index}
									className={`${styles.optionLabel} ${isSelected ? styles.optionLabelSelected : ''}`}
								>
									<input
										type="radio"
										name={`radio-${question.userQuestionId}`}
										value={option.option}
										checked={isSelected}
										onChange={() => handleRadioChange(option.option, index)}
										className={styles.radioInput}
										required={required}
									/>
									<span
										className={`${styles.optionText} ${isSelected ? styles.selectedInput : ''}`}
									>
										{option.option}
									</span>
								</label>
							);
						})}
						{renderOtherOption('radio')}
					</div>
				);

			case UserDemographicQuestionType.dropdown:
				return (
					<select
						value={typeof value === 'string' ? value : ''}
						onChange={(e) => {
							const newValue = e.target.value;
							validateInput(newValue);
							onChange(newValue);
						}}
						className={styles.dropdownSelect}
						required={required}
						aria-required={required}
						aria-invalid={!!validationError}
						aria-describedby={validationError ? `${question.userQuestionId}-error` : undefined}
					>
						<option value="">{t('Select an option')}</option>
						{question.options?.map((option, index) => (
							<option key={index} value={option.option}>
								{option.option}
							</option>
						))}
					</select>
				);

			default:
				return null;
		}
	};

	return (
		<div className={`${styles.container} ${className}`}>
			<div className={styles.questionSection}>
				<h3 className={styles.questionTitle}>
					{question.question}
					{required && <span className={styles.required}>*</span>}
				</h3>
				{renderInput()}
				{validationError && (
					<div
						id={`${question.userQuestionId}-error`}
						className={styles.errorMessage}
						role="alert"
						aria-live="polite"
					>
						{validationError}
					</div>
				)}
			</div>
		</div>
	);
};

export default UserDemographicQuestionInput;
