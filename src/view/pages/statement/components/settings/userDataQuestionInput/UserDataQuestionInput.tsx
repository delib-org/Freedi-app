import { UserQuestion, UserQuestionType } from "delib-npm";
import { ChangeEvent, FC } from "react";
import styles from './UserDataQuestionInput.module.scss';

interface UserQuestionInputProps {
	question: UserQuestion;
	value?: string | string[];
	onChange: (value: string | string[]) => void;
	className?: string;
}

const UserQuestionInput: FC<UserQuestionInputProps> = ({
	question,
	value = '',
	onChange,
	className = ''
}) => {
	const handleTextChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		onChange(e.target.value);
	};

	const handleRadioChange = (selectedValue: string) => {
		onChange(selectedValue);
	};

	const handleCheckboxChange = (optionValue: string) => {
		const currentValues = Array.isArray(value) ? value : [];
		const newValues = currentValues.includes(optionValue)
			? currentValues.filter(v => v !== optionValue)
			: [...currentValues, optionValue];
		onChange(newValues);
	};

	const renderInput = () => {
		switch (question.type) {
			case UserQuestionType.text:
				return (
					<div className={styles.inputContainer}>
						<input
							type="text"
							value={value as string}
							onChange={handleTextChange}
							placeholder="Write your location here..."
							className={styles.textInput}
							required={question.required}
						/>
					</div>
				); case UserQuestionType.textarea:
				return (
					<div className={styles.inputContainer}>
						<textarea
							value={value as string}
							onChange={handleTextChange}
							placeholder="Express your viewpoint..."
							rows={4}
							className={styles.textareaInput}
							required={question.required}
						/>
					</div>
				); case UserQuestionType.radio:
				return (
					<div className={styles.optionsContainer}>
						{question.options.map((option, index) => (
							<label key={index} className={styles.optionLabel}>
								<input
									type="radio"
									name={`radio-${question.statementId}`}
									value={option}
									checked={value === option}
									onChange={() => handleRadioChange(option)}
									className={styles.radioInput}
									required={question.required}
								/>
								<span className={styles.optionText}>{option}</span>
							</label>
						))}
					</div>
				); case UserQuestionType.checkbox:
				return (
					<div className={styles.optionsContainer}>
						{question.options.map((option, index) => {
							const currentValues = Array.isArray(value) ? value : [];

							return (
								<label key={index} className={styles.optionLabel}>
									<input
										type="checkbox"
										value={option}
										checked={currentValues.includes(option)}
										onChange={() => handleCheckboxChange(option)}
										className={styles.checkboxInput}
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
					{question.required && <span className={styles.required}>*</span>}
				</h3>
				{renderInput()}
			</div>
		</div>
	);
};

export default UserQuestionInput;