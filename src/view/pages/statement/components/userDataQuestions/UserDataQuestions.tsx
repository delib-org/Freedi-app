import { UserQuestion, UserQuestionType } from 'delib-npm';
import { FC, useState, FormEvent } from 'react';
import UserQuestionInput from '../settings/userDataQuestionInput/UserDataQuestionInput';
import { setUserAnswers } from '@/controllers/db/userData/setUserData';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import styles from './UserDataQuestions.module.scss';

interface Props {
	questions: UserQuestion[];
	closeModal?: () => void;
}

const UserDataQuestions: FC<Props> = ({ questions, closeModal }) => {
	const [userData, setUserData] = useState<UserQuestion[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleQuestionChange = (
		question: UserQuestion,
		value: string | string[]
	) => {
		// Update the statement with the new user data
		if (
			question.type === UserQuestionType.text ||
			question.type === UserQuestionType.textarea ||
			question.type === UserQuestionType.radio
		) {
			setUserData((prevData) => {
				const currentQuestion = prevData.find(
					(q) => q.userQuestionId === question.userQuestionId
				);
				if (currentQuestion) {
					return prevData.map((q) =>
						q.userQuestionId === question.userQuestionId
							? {
								...q,
								answer: Array.isArray(value)
									? value.join(',')
									: value,
							}
							: q
					);
				}

				return [
					...prevData,
					{
						...question,
						answer: Array.isArray(value) ? value.join(',') : value,
					},
				];
			});
		} else if (question.type === UserQuestionType.checkbox) {
			setUserData((prevData) => {
				const currentQuestion = prevData.find(
					(q) => q.userQuestionId === question.userQuestionId
				);
				const _value = value[0];
				if (currentQuestion) {
					const newOptions = currentQuestion.answerOptions.includes(
						_value as string
					)
						? currentQuestion.answerOptions.filter(
							(option) => option !== _value
						)
						: [...currentQuestion.answerOptions, _value as string];

					return prevData.map((q) =>
						q.userQuestionId === question.userQuestionId
							? { ...q, answerOptions: newOptions }
							: q
					);
				}

				return [
					...prevData,
					{ ...question, answerOptions: [_value as string] },
				];
			});
		}
	};

	const validateForm = (): boolean => {
		// Check if all questions have been answered
		for (const question of questions) {
			const userAnswer = userData.find(
				(q) => q.userQuestionId === question.userQuestionId
			);

			if (!userAnswer) {
				return false;
			}

			// Check based on question type
			if (
				question.type === UserQuestionType.text ||
				question.type === UserQuestionType.textarea ||
				question.type === UserQuestionType.radio
			) {
				if (!userAnswer.answer || userAnswer.answer.trim() === '') {
					return false;
				}
			} else if (question.type === UserQuestionType.checkbox) {
				if (
					!userAnswer.answerOptions ||
					userAnswer.answerOptions.length === 0
				) {
					return false;
				}
			}
		}

		return true;
	};

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!validateForm()) {
			alert('Please answer all required fields before submitting.');

			return;
		}

		setIsSubmitting(true);

		try {
			await setUserAnswers(userData);
			closeModal?.();
		} catch (error) {
			console.error('Error saving user answers:', error);
			// You might want to show an error message to the user here
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className={styles.form}>
			{questions.map((question: UserQuestion) => (
				<UserQuestionInput
					key={question.userQuestionId}
					question={question}
					value={''}
					options={question.options || []}
					onChange={(value) => handleQuestionChange(question, value)}
					required={true}
				/>
			))}
			<div className={styles.button}>
				<Button
					text={isSubmitting ? 'Submitting...' : 'Submit'}
					buttonType={ButtonType.PRIMARY}
					disabled={isSubmitting || !validateForm()}
				></Button>
			</div>
		</form>
	);
};

export default UserDataQuestions;
