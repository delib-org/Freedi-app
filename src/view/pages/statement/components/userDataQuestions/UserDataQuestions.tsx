import { QuestionType, Statement, UserQuestion, UserQuestionType } from 'delib-npm'
import { FC, useState } from 'react'
import UserQuestionInput from '../settings/userDataQuestionInput/UserDataQuestionInput';

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
				if (currentQuestion) {
					if (currentQuestion.answerOptions.includes(value as string)) {
						currentQuestion.answerOptions = [...currentQuestion.answerOptions.filter(option => option !== value)];
					} else {
						currentQuestion.answerOptions = [...currentQuestion.answerOptions, value as string];
					}

					return prevData.map(q =>
						q.userQuestionId === question.userQuestionId ? { ...q, answerOptions: currentQuestion.answerOptions } : q
					);
				}

				return [...prevData, { ...question, answerOptions: [value as string] }];
			});
		}

		console.log(userData)
	};

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
				<button className="btn btn--secondary" onClick={() => { console.log("close modal"); closeModal(); }}>Submit</button>
			</div>
		</div >
	)
}
export default UserDataQuestions