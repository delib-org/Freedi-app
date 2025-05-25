import React, { useState } from 'react'
import SectionTitle from '../sectionTitle/SectionTitle'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import SettingsModal from '../settingsModal/SettingsModal'
import UserQuestionComp from './userQuestion/UserQuestionComp';

export enum UserQuestionType {
	text = 'text',
	textarea = 'textarea',
	checkbox = 'checkbox',
	radio = 'radio',
}

export interface UserQuestion {
	question: string;
	type: UserQuestionType;
	options?: string[]; // For checkbox and radio types
}

//mockData
const userQuestions: UserQuestion[] = [
	{
		question: 'What is your favorite color?',
		type: UserQuestionType.radio,
		options: ['Red', 'Blue', 'Green'],
	},
	{
		question: 'Tell us about yourself',
		type: UserQuestionType.textarea,
	},
	{
		question: 'What foods do you like?',
		type: UserQuestionType.checkbox,
		options: ['Pizza', 'Burger', 'Salad'],
	},
]

const UserDataSetting = () => {
	const { t } = useUserConfig()
	const [showModal, setShowModal] = useState(true)

	function closeModal() {
		setShowModal(false)
	}

	return (
		<div>
			<SectionTitle title={t('Member Information')} />
			<div className="btns">
				<button className='btn btn--secondary' onClick={() => setShowModal(true)}>{t('Edit')}</button>
			</div>
			{showModal && <SettingsModal closeModal={closeModal}>
				<div className="user-data-settings">
					<p>{t('User data settings content goes here.')}</p>
					{/* Add form or content for user data settings */}
				</div>
				{userQuestions.map((question, index) => (
					<UserQuestionComp key={index} userQuestions={question} />
				))}
			</SettingsModal>}
		</div>
	)
}

export default UserDataSetting