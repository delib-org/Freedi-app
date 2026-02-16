import { UserDemographicQuestion, UserDemographicQuestionType, Role } from '@freedi/shared-types';
import { FC, useState, FormEvent, useMemo } from 'react';

// Use string literal for scope until delib-npm exports the enum value
const DEMOGRAPHIC_SCOPE_GROUP = 'group' as const;
import UserDemographicQuestionInput from '../settings/userDemographicQuestionInput/UserDemographicQuestionInput';
import { setUserAnswers } from '@/controllers/db/userDemographic/setUserDemographic';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import styles from './UserDemographicQuestions.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import BackToMenuArrow from '@/assets/icons/backToMenuArrow.svg?react';
import X from '@/assets/icons/x.svg?react';
import { useNavigate } from 'react-router';

interface Props {
	questions: UserDemographicQuestion[];
	closeModal?: () => void;
	isMandatory?: boolean; // Flag to indicate if the survey is mandatory
	role?: Role; // User role to determine admin permissions
}

const OTHER_SENTINEL = '__other__';

const UserDemographicQuestions: FC<Props> = ({
	questions,
	closeModal,
	isMandatory = true,
	role,
}) => {
	const [userDemographic, setUserDemographic] = useState<UserDemographicQuestion[]>([]);
	const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const { t } = useTranslation();
	const navigate = useNavigate();

	// Check if the user is an admin (admin or creator role)
	const isAdmin = role === Role.admin || role === Role.creator;

	// Separate questions by scope (group vs statement)
	const { groupQuestions, statementQuestions } = useMemo(() => {
		const groupQ = questions.filter((q) => q.scope === DEMOGRAPHIC_SCOPE_GROUP);
		const statementQ = questions.filter((q) => q.scope !== DEMOGRAPHIC_SCOPE_GROUP);

		return { groupQuestions: groupQ, statementQuestions: statementQ };
	}, [questions]);

	// Progress calculation
	const answeredCount = userDemographic.length;
	const totalCount = questions.length;
	const progressPercent = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0;
	const handleOtherTextChange = (questionId: string, text: string) => {
		setOtherTexts((prev) => ({ ...prev, [questionId]: text }));

		// Also update the otherText on the demographic answer
		setUserDemographic((prevData) =>
			prevData.map((q) =>
				q.userQuestionId === questionId ? { ...q, otherText: text } : q
			)
		);
	};

	const handleQuestionChange = (question: UserDemographicQuestion, value: string | string[]) => {
		const questionId = question.userQuestionId || '';
		const currentOtherText = otherTexts[questionId] || '';

		// Update the statement with the new user demographic
		if (
			question.type === UserDemographicQuestionType.text ||
			question.type === UserDemographicQuestionType.textarea ||
			question.type === UserDemographicQuestionType.radio ||
			question.type === UserDemographicQuestionType.dropdown
		) {
			const answerValue = Array.isArray(value) ? value.join(',') : value;

			setUserDemographic((prevData) => {
				const currentQuestion = prevData.find((q) => q.userQuestionId === question.userQuestionId);
				if (currentQuestion) {
					return prevData.map((q) =>
						q.userQuestionId === question.userQuestionId
							? {
									...q,
									answer: answerValue,
									otherText: answerValue === OTHER_SENTINEL ? currentOtherText : undefined,
								}
							: q,
					);
				}

				return [
					...prevData,
					{
						...question,
						answer: answerValue,
						otherText: answerValue === OTHER_SENTINEL ? currentOtherText : undefined,
					},
				];
			});
		} else if (question.type === UserDemographicQuestionType.checkbox) {
			const arrayValue = value as string[];
			const hasOther = arrayValue.includes(OTHER_SENTINEL);

			setUserDemographic((prevData) => {
				const currentQuestion = prevData.find((q) => q.userQuestionId === question.userQuestionId);

				if (currentQuestion) {
					return prevData.map((q) =>
						q.userQuestionId === question.userQuestionId
							? {
									...q,
									answerOptions: arrayValue,
									otherText: hasOther ? currentOtherText : undefined,
								}
							: q
					);
				}

				return [
					...prevData,
					{
						...question,
						answerOptions: arrayValue,
						otherText: hasOther ? currentOtherText : undefined,
					},
				];
			});
		}
	};

	const validateForm = (): boolean => {
		// Check if all questions have been answered
		for (const question of questions) {
			const userAnswer = userDemographic.find((q) => q.userQuestionId === question.userQuestionId);

			if (!userAnswer) {
				return false;
			}

			// Check based on question type
			if (
				question.type === UserDemographicQuestionType.text ||
				question.type === UserDemographicQuestionType.textarea ||
				question.type === UserDemographicQuestionType.radio ||
				question.type === UserDemographicQuestionType.dropdown
			) {
				if (!userAnswer.answer || userAnswer.answer.trim() === '') {
					return false;
				}
				// If "Other" is selected, require otherText
				if (userAnswer.answer === OTHER_SENTINEL) {
					const text = otherTexts[question.userQuestionId || ''] || '';
					if (!text.trim()) {
						return false;
					}
				}
			} else if (question.type === UserDemographicQuestionType.checkbox) {
				if (!userAnswer.answerOptions || userAnswer.answerOptions.length === 0) {
					return false;
				}
				// If "Other" is in the selected options, require otherText
				if (userAnswer.answerOptions.includes(OTHER_SENTINEL)) {
					const text = otherTexts[question.userQuestionId || ''] || '';
					if (!text.trim()) {
						return false;
					}
				}
			}
		}

		return true;
	};

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!validateForm()) {
			alert(t('Please answer all required fields before submitting'));

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

	// Admin can close without filling or saving the form
	const handleAdminClose = () => {
		closeModal?.();
	};

	return (
		<div className={styles.userDemographicContainer}>
			<div className={styles.surveyBody}>
				<div className={styles.topNavSurvey}>
					{!isMandatory && <BackToMenuArrow onClick={() => navigate('/')} />}
					{((!isMandatory && closeModal) || (isAdmin && closeModal)) && (
						<X className={styles.XBtn} onClick={isAdmin ? handleAdminClose : closeModal} />
					)}
				</div>
				<h1 className={styles.title}>{t('User Profile Setup')}</h1>
				<p className={styles.description}>
					{isMandatory
						? t('Please complete this survey to access the discussion')
						: t('Complete these setup questions')}
				</p>

				{/* Progress indicator */}
				{questions.length > 1 && (
					<div className={styles.progressContainer}>
						<div className={styles.progressBar}>
							<div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
						</div>
						<span className={styles.progressText}>
							{answeredCount} / {totalCount} {t('completed')}
						</span>
					</div>
				)}

				<form onSubmit={handleSubmit}>
					{/* Group-level questions section */}
					{groupQuestions.length > 0 && (
						<section className={styles.questionSection}>
							<h3 className={styles.sectionTitle}>{t('Group Profile')}</h3>
							<p className={styles.sectionDescription}>
								{t('Your answers apply to all discussions in this group')}
							</p>
							{groupQuestions.map((question: UserDemographicQuestion) => {
								const currentAnswer = userDemographic.find(
									(q) => q.userQuestionId === question.userQuestionId,
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
										onChange={(val) => handleQuestionChange(question, val)}
										onOtherTextChange={handleOtherTextChange}
										otherText={otherTexts[question.userQuestionId || ''] || ''}
										required={true}
									/>
								);
							})}
						</section>
					)}

					{/* Statement-level questions section */}
					{statementQuestions.length > 0 && (
						<section className={styles.questionSection}>
							{groupQuestions.length > 0 && (
								<>
									<h3 className={styles.sectionTitle}>{t('Discussion Questions')}</h3>
									<p className={styles.sectionDescription}>
										{t('These questions are specific to this discussion')}
									</p>
								</>
							)}
							{statementQuestions.map((question: UserDemographicQuestion) => {
								const currentAnswer = userDemographic.find(
									(q) => q.userQuestionId === question.userQuestionId,
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
										onChange={(val) => handleQuestionChange(question, val)}
										onOtherTextChange={handleOtherTextChange}
										otherText={otherTexts[question.userQuestionId || ''] || ''}
										required={true}
									/>
								);
							})}
						</section>
					)}

					<div className={styles.button}>
						<Button
							text={isSubmitting ? t('Submitting...') : t('Submit Survey')}
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
