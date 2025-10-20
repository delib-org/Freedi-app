import { UserDemographicQuestion, UserDemographicQuestionType } from 'delib-npm';
import { FC, useState, FormEvent } from 'react';
import UserDemographicQuestionInput from '../settings/userDemographicQuestionInput/UserDemographicQuestionInput';
import { setUserAnswers } from '@/controllers/db/userDemographic/setUserDemographic';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import styles from './UserDemographicQuestions.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import BackToMenuArrow from '@/assets/icons/backToMenuArrow.svg?react';
import X from '@/assets/icons/x.svg?react';
import { useNavigate } from 'react-router';

interface Props {
	questions: UserDemographicQuestion[];
	closeModal?: () => void;
}

const UserDemographicQuestions: FC<Props> = ({ questions, closeModal }) => {
	const [userDemographic, setUserDemographic] = useState<UserDemographicQuestion[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const { t } = useUserConfig();
	const isSurveyOptional = userDemographic.some(
		(survey) => survey.required === true
	);
	const navigate = useNavigate();
	const handleQuestionChange = (
		question: UserDemographicQuestion,
		value: string | string[]
	) => {
		// Update the statement with the new user demographic
		if (
			question.type === UserDemographicQuestionType.text ||
			question.type === UserDemographicQuestionType.textarea ||
			question.type === UserDemographicQuestionType.radio
		) {
			setUserDemographic((prevData) => {
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
		} else if (question.type === UserDemographicQuestionType.checkbox) {
			setUserDemographic((prevData) => {
				const currentQuestion = prevData.find(
					(q) => q.userQuestionId === question.userQuestionId
				);

				if (currentQuestion) {
					return prevData.map((q) =>
						q.userQuestionId === question.userQuestionId
							? { ...q, answerOptions: value as string[] }
							: q
					);
				}

				return [
					...prevData,
					{ ...question, answerOptions: value as string[] },
				];
			});
		}
	};

	const validateForm = (): boolean => {
		// Check if all questions have been answered
		for (const question of questions) {
			const userAnswer = userDemographic.find(
				(q) => q.userQuestionId === question.userQuestionId
			);

			if (!userAnswer) {
				return false;
			}

			// Check based on question type
			if (
				question.type === UserDemographicQuestionType.text ||
				question.type === UserDemographicQuestionType.textarea ||
				question.type === UserDemographicQuestionType.radio
			) {
				if (!userAnswer.answer || userAnswer.answer.trim() === '') {
					return false;
				}
			} else if (question.type === UserDemographicQuestionType.checkbox) {
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
			await setUserAnswers(userDemographic);
			closeModal?.();
		} catch (error) {
			console.error('Error saving user answers:', error);
			// You might want to show an error message to the user here
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className={styles.userDemographicContainer}>
			<div className={styles.surveyBody}>
				<div className={styles.topNavSurvey}>
					<BackToMenuArrow onClick={() => navigate('/')} />
					{isSurveyOptional && (
						<X className={styles.XBtn} onClick={closeModal} />
					)}
				</div>
				<h1 className={styles.title}>{t('User Profile Setup')}</h1>
				<p className={styles.description}>
					{t('Complete these setup questions')}
				</p>
				<form onSubmit={handleSubmit}>
					{questions.map((question: UserDemographicQuestion) => {
						const currentAnswer = userDemographic.find(
							(q) => q.userQuestionId === question.userQuestionId
						);
						let value: string | string[] = '';

						if (question.type === UserDemographicQuestionType.checkbox) {
							value = currentAnswer?.answerOptions || [];
						} else {
							value = currentAnswer?.answer || '';
						}

						return (
							<UserDemographicQuestionInput
								key={question.userQuestionId}
								question={question}
								value={value}
								options={question.options || []}
								onChange={(value) =>
									handleQuestionChange(question, value)
								}
								required={true}
							/>
						);
					})}
					<div className={styles.button}>
						<Button
							text={
								isSubmitting ? 'Submitting...' : 'Submit Survey'
							}
							buttonType={ButtonType.PRIMARY}
							disabled={isSubmitting || !validateForm()}
						></Button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default UserDemographicQuestions;
