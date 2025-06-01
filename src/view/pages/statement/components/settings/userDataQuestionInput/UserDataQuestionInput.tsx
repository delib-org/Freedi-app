import { UserQuestion, UserQuestionType } from "delib-npm";
import { ChangeEvent, FC, useEffect, useState } from "react";
import styles from './UserDataQuestionInput.module.scss';

interface UserQuestionInputProps {
	question: UserQuestion;
	value?: string | string[];
	options?: string[];
	onChange: (value: string | string[]) => void;
	className?: string;
	required?: boolean;
}

const UserQuestionInput: FC<UserQuestionInputProps> = ({
	question,
	value = '',
	onChange,
	className = '',
	required = false
}) => {
	const [validationError, setValidationError] = useState('');

	const validateInput = (inputValue: string | string[]) => {
		if (!required) {
			setValidationError('');

			return true;
		}

		switch (question.type) {
			case UserQuestionType.text:
			case UserQuestionType.textarea:
			case UserQuestionType.radio:
				if (!inputValue || (typeof inputValue === 'string' && inputValue.trim() === '')) {
					setValidationError('This field is required');

					return false;
				}
				break;
			case UserQuestionType.checkbox:
				if (!Array.isArray(inputValue) || inputValue.length === 0) {
					setValidationError('Please select at least one option');

					return false;
				}
				break;
		}

		setValidationError('');

		return true;
	};

	const handleTextChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		const newValue = e.target.value;
		validateInput(newValue);
		onChange(newValue);
	};

	const handleRadioChange = (selectedValue: string) => {
		validateInput(selectedValue);
		onChange(selectedValue);
	};

	const handleCheckboxChange = (optionValue: string) => {
		const currentValues = Array.isArray(value) ? value : [];
		const newValues = currentValues.includes(optionValue)
			? currentValues.filter(v => v !== optionValue)
			: [...currentValues, optionValue];

		validateInput(newValues);
		onChange(newValues);
	};

	// Validate on mount and when value/required changes
	useEffect(() => {
		if (required) {
			validateInput(value);
		}
	}, [value, required]);

	const renderInput = () => {
		switch (question.type) {
			case UserQuestionType.text:
				return (
					<div className={styles.inputContainer}>
						<input
							type="text"
							defaultValue={value as string}
							onChange={handleTextChange}
							placeholder="Write your location here..."
							className={`${styles.textInput} ${validationError ? styles.inputError : ''}`}
							required={required}
							aria-invalid={!!validationError}
							aria-describedby={validationError ? `${question.userQuestionId}-error` : undefined}
						/>
					</div>
				);

			case UserQuestionType.textarea:
				return (
					<div className={styles.inputContainer}>
						<textarea
							defaultValue={value as string}
							onChange={handleTextChange}
							placeholder="Express your viewpoint..."
							rows={4}
							className={`${styles.textareaInput} ${validationError ? styles.inputError : ''}`}
							required={required}
							aria-invalid={!!validationError}
							aria-describedby={validationError ? `${question.userQuestionId}-error` : undefined}
						/>
					</div>
				);

			case UserQuestionType.radio:
				return (
					<div className={styles.optionsContainer} role="radiogroup" aria-required={required}>
						{question.options?.map((option, index) => (
							<label key={index} className={styles.optionLabel}>
								<input
									type="radio"
									name={`radio-${question.userQuestionId}`}
									value={option}
									defaultChecked={value === option}
									onChange={() => handleRadioChange(option)}
									className={styles.radioInput}
									required={required}
								/>
								<span className={styles.optionText}>{option}</span>
							</label>
						))}
					</div>
				);

			case UserQuestionType.checkbox:
				return (
					<div className={styles.optionsContainer}>
						{question.options?.map((option, index) => {
							const currentValues = Array.isArray(value) ? value : [];

							return (
								<label key={index} className={styles.optionLabel}>
									<input
										type="checkbox"
										defaultChecked={currentValues.includes(option)}
										onChange={() => handleCheckboxChange(option)}
										className={styles.checkboxInput}
										aria-describedby={validationError ? `${question.userQuestionId}-error` : undefined}
									/>
									<span className={styles.optionText}>{option}</span>
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

export default UserQuestionInput;