import React, { FC, useState } from 'react'
import SectionTitle from '../sectionTitle/SectionTitle'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import SettingsModal from '../settingsModal/SettingsModal'
import UserQuestionComp from './userQuestion/UserQuestionComp'
import Input from '@/view/components/input/Input'
import PlusIcon from '@/assets/icons/plusIcon.svg?react'
import styles from './UserDataSetting.module.scss'
import { Statement, UserQuestion, UserQuestionType } from 'delib-npm'
import { addUserDataQuestion } from '@/controllers/db/userData/setUserData'

//mockData
const initialUserQuestions: UserQuestion[] = [
	// {
	// 	question: 'What is your favorite color?',
	// 	type: UserQuestionType.radio,
	// 	options: ['Red', 'Blue', 'Green'],
	// },
	// {
	// 	question: 'Tell us about yourself',
	// 	type: UserQuestionType.textarea,
	// },
	// {
	// 	question: 'What foods do you like?',
	// 	type: UserQuestionType.checkbox,
	// 	options: ['Pizza', 'Burger', 'Salad'],
	// },
]

interface Props {
	statement: Statement;
}

const UserDataSetting: FC<Props> = ({ statement }) => {
	const { t } = useUserConfig()
	const [showModal, setShowModal] = useState(true)
	const [userQuestions, setUserQuestions] = useState<UserQuestion[]>(initialUserQuestions)
	const [newQuestion, setNewQuestion] = useState('')
	const [newQuestionType, setNewQuestionType] = useState<UserQuestionType>(UserQuestionType.text)
	function closeModal() {
		setShowModal(false)
	}

	const handleAddNewQuestion = () => {
		if (!newQuestion.trim()) return

		const newQuestionObj: UserQuestion = {
			question: newQuestion.trim(),
			type: newQuestionType,
			statementId: statement.statementId,
			options: newQuestionType === UserQuestionType.checkbox || newQuestionType === UserQuestionType.radio ? [] : []
		}

		setUserQuestions(prevQuestions => [...prevQuestions, newQuestionObj])
		setNewQuestion('')
		setNewQuestionType(UserQuestionType.text)

		addUserDataQuestion(statement, newQuestionObj)
	}
	const handleDeleteQuestion = (questionIndex: number) => {
		setUserQuestions(prevQuestions => prevQuestions.filter((_, index) => index !== questionIndex))
	}

	const handleUpdateQuestion = (questionIndex: number, updatedQuestion: Partial<UserQuestion>) => {
		setUserQuestions(prevQuestions =>
			prevQuestions.map((question, index) =>
				index === questionIndex ? { ...question, ...updatedQuestion } : question
			)
		)
	}
	const handleAddOption = (questionIndex: number, newOption: string) => {
		if (!newOption.trim()) return

		setUserQuestions(prevQuestions =>
			prevQuestions.map((question, index) => {
				if (index === questionIndex) {
					const updatedOptions = question.options ? [...question.options, newOption.trim()] : [newOption.trim()]

					return { ...question, options: updatedOptions }
				}

				return question
			})
		)
	}
	const handleDeleteOption = (questionIndex: number, optionIndex: number) => {
		setUserQuestions(prevQuestions =>
			prevQuestions.map((question, index) => {
				if (index === questionIndex && question.options) {
					const updatedOptions = question.options.filter((_, idx) => idx !== optionIndex)

					return { ...question, options: updatedOptions }
				}

				return question
			})
		)
	}

	return (
		<div>
			<SectionTitle title={t('Member Information')} />
			<div className="btns">
				<button className='btn btn--secondary' onClick={() => setShowModal(true)}>{t('Edit')}</button>
			</div>			{showModal && <SettingsModal closeModal={closeModal}>
				<div className={styles.userDataSettings}>
					<h3>{t('User Data Questions')}</h3>

					{/* New Question Form */}
					<div className={styles.newQuestionForm}>
						<h4>{t('Add New Question')}</h4>
						<div className={styles.formFields}>
							<Input
								name="newQuestion"
								label={t('Question Text')}
								placeholder={t('Enter your question')}
								value={newQuestion}
								onChange={(value) => setNewQuestion(value)}
							/>

							<div className={styles.selectField}>
								<label htmlFor="questionType">
									{t('Question Type')}
								</label>
								<select
									id="questionType"
									value={newQuestionType}
									onChange={(e) => setNewQuestionType(e.target.value as UserQuestionType)}
								>
									<option value={UserQuestionType.text}>{t('Text Input')}</option>
									<option value={UserQuestionType.textarea}>{t('Text Area')}</option>
									<option value={UserQuestionType.checkbox}>{t('Multiple Choice (Checkbox)')}</option>
									<option value={UserQuestionType.radio}>{t('Single Choice (Radio)')}</option>
								</select>
							</div>
							<button
								className="btn btn--add"
								onClick={handleAddNewQuestion}
								disabled={!newQuestion.trim()}
							>
								<PlusIcon />
								{t('Add Question')}
							</button>
						</div>
					</div>

					{/* Existing Questions */}
					<div className={styles.existingQuestions}>
						<h4>{t('Existing Questions')}</h4>
						{userQuestions.length === 0 ? (
							<p className={styles.emptyState}>{t('No questions added yet')}</p>
						) : (userQuestions.map((question, index) => (
							<UserQuestionComp
								key={index}
								userQuestions={question}
								questionIndex={index}
								onAddOption={handleAddOption}
								onDeleteOption={handleDeleteOption}
								onDeleteQuestion={handleDeleteQuestion}
								onUpdateQuestion={handleUpdateQuestion}
							/>
						))
						)}
					</div>
				</div>
			</SettingsModal>}
		</div>
	)
}

export default UserDataSetting