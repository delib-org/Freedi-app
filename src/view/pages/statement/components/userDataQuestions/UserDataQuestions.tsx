import { QuestionType, Statement, UserQuestion, UserQuestionType } from 'delib-npm'
import { FC, useState } from 'react'
import UserQuestionInput from '../settings/userDataQuestionInput/UserDataQuestionInput';
import { setUserAnswers } from '@/controllers/db/userData/setUserData';

interface Props {
	statement: Statement;
	questions: UserQuestion[];
	closeModal?: () => void;
}

const UserDataQuestions: FC<Props> = ({ statement, questions, closeModal }) => {

	const [userData, setUserData] = useState<UserQuestion[]>([]);

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

					console.log("newOptions", newOptions);

					return prevData.map(q =>
						q.userQuestionId === question.userQuestionId ? { ...q, answerOptions: newOptions } : q
					);
				}

				return [...prevData, { ...question, answerOptions: [_value as string] }];
			});
		}
	};

	function handleSaveUserAnswers() {
		setUserAnswers(userData);
		closeModal();
	}

	return (
		<div>
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
				<button className="btn btn--secondary" onClick={handleSaveUserAnswers}>Submit</button>
			</div>
		</div >
	)
}
export default UserDataQuestions