import { UserDemographicQuestion, UserDemographicQuestionType } from 'delib-npm';
import { FC, useEffect, useState } from 'react';
import styles from './UserDemographicQuestionInput.module.scss';

interface UserDemographicQuestionInputProps {
	question: UserDemographicQuestion;
	value?: string | string[];
	options?: { option: string; color?: string }[];
	onChange: (value: string | string[]) => void;
	className?: string;
	required?: boolean;
}

const UserDemographicQuestionInput: FC<UserDemographicQuestionInputProps> = ({
	question,
	value = '',
	onChange,
	className = '',
	required = false,
}) => {
	const [validationError, setValidationError] = useState('');
	const [isChosen, setIsChosen] = useState<number | null>(null);
	const validateInput = (inputValue: string | string[]) => {
		if (!required) {
			setValidationError('');

			return true;
		}

		switch (question.type) {
			case UserDemographicQuestionType.text:
			case UserDemographicQuestionType.textarea:
			case UserDemographicQuestionType.radio:
				if (
					!inputValue ||
					(typeof inputValue === 'string' && inputValue.trim() === '')
				) {
					setValidationError('- This field is required');

					return false;
				}
				break;
			case UserDemographicQuestionType.checkbox:
				if (!Array.isArray(inputValue) || inputValue.length === 0) {
					setValidationError('Please select at least one option');

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
	};

	// Validate on mount and when value/required changes
	useEffect(() => {
		if (required) {
			validateInput(value);
		}
	}, [value, required]);

	const renderInput = () => {
		switch (question.type) {
			case UserDemographicQuestionType.text:
				return (
					<input
						type='text'
						value={typeof value === 'string' ? value : ''}
						onChange={(e) => {
							const newValue = e.target.value;
							validateInput(newValue);
							onChange(newValue);
						}}
						placeholder='Enter your answer'
						className={styles.textInput}
						required={required}
						aria-required={required}
						aria-invalid={!!validationError}
						aria-describedby={
							validationError
								? `${question.userQuestionId}-error`
								: undefined
						}
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
						placeholder='Enter your detailed answer'
						className={styles.textareaInput}
						rows={4}
						required={required}
						aria-required={required}
						aria-invalid={!!validationError}
						aria-describedby={
							validationError
								? `${question.userQuestionId}-error`
								: undefined
						}
					/>
				);

			case UserDemographicQuestionType.checkbox:
				return (
					<div
						className={styles.optionsContainer}
						role='group'
						aria-required={required}
					>
						{question.options?.map((option, index) => {
							const isChecked = Array.isArray(value) && value.includes(option.option);
							return (
								<label key={index} className={styles.optionLabel}>
									<input
										type='checkbox'
										name={`checkbox-${question.userQuestionId}`}
										value={option.option}
										checked={isChecked}
										onChange={(e) => {
											const newValue = e.target.checked
												? Array.isArray(value)
													? [...value, option.option]
													: [option.option]
												: Array.isArray(value)
													? value.filter(v => v !== option.option)
													: [];
											validateInput(newValue);
											onChange(newValue);
										}}
										className={styles.checkboxInput}
									/>
									<span className={styles.optionText}>
										{option.option}
									</span>
								</label>
							);
						})}
					</div>
				);

			case UserDemographicQuestionType.radio:
				return (
					<div
						className={styles.optionsContainer}
						role='radiogroup'
						aria-required={required}
					>
						{question.options?.map((option, index) => (
							<label key={index} className={styles.optionLabel}>
								<input
									type='radio'
									name={`radio-${question.userQuestionId}`}
									value={option.option}
									defaultChecked={value === option.option}
									onChange={() =>
										handleRadioChange(option.option, index)
									}
									className={styles.radioInput}
									required={required}
								/>
								<span
									className={`${isChosen !== null && styles.optionText} ${isChosen === index && styles.selectedInput}`}
								>
									{option.option}
								</span>
							</label>
						))}
					</div>
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
						role='alert'
						aria-live='polite'
					>
						{validationError}
					</div>
				)}
			</div>
		</div>
	);
};

export default UserDemographicQuestionInput;
