import { Statement, UserQuestion } from 'delib-npm'
import { FC } from 'react'
import UserQuestionInput from '../settings/userDataQuestionInput/UserDataQuestionInput';

interface Props {
	statement: Statement;
	questions: UserQuestion[];
	closeModal?: () => void;
}

const UserDataQuestions: FC<Props> = ({ statement, questions, closeModal }) => {

	const handleQuestionChange = (questionId: string, value: string | string[]) => {
		// Update the statement with the new user data
		const updatedUserData = {
			...statement.userData,
			[questionId]: value
		};

		// Here you would typically dispatch an action to update the Redux store
		console.log(`Updated question ${questionId} with value:`, updatedUserData);
	};

	return (
		<div>
			{questions.map((question: UserQuestion) => (
				<UserQuestionInput
					key={question.userQuestionId}
					question={question}
					value={''}
					onChange={(value) => handleQuestionChange(question.userQuestionId, value)}
				/>
			))}
			<div className="btns">
				<button className="btn btn--secondary" onClick={() => { console.log("close modal"); closeModal(); }}>Submit</button>
			</div>
		</div >
	)
}

export default UserDataQuestions