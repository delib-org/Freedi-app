import React from 'react'
import { UserQuestion, UserQuestionType } from '../UserDataSetting'
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import DeleteIcon from '@/assets/icons/delete.svg?react';

interface Props {
	userQuestions: UserQuestion;
}

const UserQuestionComp = ({ userQuestions }: Props) => {

	const { t } = useUserConfig();
	const isMultiOptions = userQuestions.type === UserQuestionType.checkbox || userQuestions.type === UserQuestionType.radio;

	return (
		<div>
			<p>{userQuestions.question}</p>
			{userQuestions.type === UserQuestionType.text && <input type="text" placeholder="Your answer" />}
			{userQuestions.type === UserQuestionType.textarea && <textarea placeholder="Your answer"></textarea>}
			{userQuestions.type === UserQuestionType.checkbox && (
				<div>
					{userQuestions.options?.map((option, index) => (
						<div key={`check-${index}`} className="checkbox-option">
							<DeleteIcon className='delete-icon' onClick={() => console.log('Delete option', option)} />

							<label >
								<input type="checkbox" value={option} />
								{option}
							</label>
						</div>
					))}
				</div>
			)}
			{userQuestions.type === UserQuestionType.radio && (
				<div>
					{userQuestions.options?.map((option, index) => (
						<div key={index}>
							<DeleteIcon className='delete-icon' onClick={() => console.log('Delete option', option)} />
							<label>
								<input type="radio" name="user-question" value={option} />
								{option}
							</label>

						</div>
					))}
				</div>
			)}
			{isMultiOptions && <div className="btns">
				<button className='btn btn--secondary'>{t('Add')}</button>
			</div>}
		</div>

	)
}

export default UserQuestionComp