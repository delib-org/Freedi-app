import { UserQuestion, UserQuestionType } from 'delib-npm'
import { FC, useState, FormEvent } from 'react'
import UserQuestionInput from '../settings/userDataQuestionInput/UserDataQuestionInput';
import { setUserAnswers } from '@/controllers/db/userData/setUserData';

interface Props {
	questions: UserQuestion[];
}

const UserDataQuestions: FC<Props> = ({ questions }) => {
	const [userData, setUserData] = useState<UserQuestion[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleQuestionChange = (question: UserQuestion, value: string | string[]) => {
		// Update the statement with the new user data
		if (question.type === UserQuestionType.text || question.type === UserQuestionType.textarea || question.type === UserQuestionType.radio) {
			setUserData((prevData) => {
				const currentQuestion = prevData.find(q => q.userQuestionId === question.userQuestionId);
				if (currentQuestion) {
					return prevData.map(q =>
						q.userQuestionId === question.userQuestionId ? { ...q, answer: Array.isArray(value) ? value.join(',') : value } : q
					);
				}

				return [...prevData, { ...question, answer: Array.isArray(value) ? value.join(',') : value }];
			});
		} else if (question.type === UserQuestionType.checkbox) {
			setUserData((prevData) => {
				const currentQuestion = prevData.find(q => q.userQuestionId === question.userQuestionId);
				const _value = value[0];
				if (currentQuestion) {
					const newOptions = currentQuestion.answerOptions.includes(_value as string)
						? currentQuestion.answerOptions.filter(option => option !== _value)
						: [...currentQuestion.answerOptions, _value as string];

					return prevData.map(q =>
						q.userQuestionId === question.userQuestionId ? { ...q, answerOptions: newOptions } : q
					);
				}

				return [...prevData, { ...question, answerOptions: [_value as string] }];
			});
		}
	};

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsSubmitting(true);

		try {
			await setUserAnswers(userData);
		} catch (error) {
			console.error('Error saving user answers:', error);
			// You might want to show an error message to the user here
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form onSubmit={handleSubmit}>
			{questions.map((question: UserQuestion) => (
				<UserQuestionInput
					key={question.userQuestionId}
					question={question}
					value={''}
					options={question.options || []}
					onChange={(value) => handleQuestionChange(question, value)}
				/>
			))}
			<div className="btns">
				<button
					type="submit"
					className="btn btn--secondary"
					disabled={isSubmitting}
				>
					{isSubmitting ? 'Submitting...' : 'Submit'}
				</button>
			</div>
		</form>
	)
}

export default UserDataQuestions