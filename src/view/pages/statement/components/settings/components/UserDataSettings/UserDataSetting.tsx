import React, { FC, useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import SectionTitle from '../sectionTitle/SectionTitle'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import SettingsModal from '../settingsModal/SettingsModal'
import UserQuestionComp from './userQuestion/UserQuestionComp'
import PlusIcon from '@/assets/icons/plusIcon.svg?react'
import styles from './UserDataSetting.module.scss'
import { getRandomUID, Statement, UserQuestion, UserQuestionType } from 'delib-npm'
import { deleteUserDataQuestion, setUserDataQuestion } from '@/controllers/db/userData/setUserData'
import { RootState } from '@/redux/store'
import { setUserQuestion, deleteUserQuestion, selectUserQuestionsByStatementId } from '@/redux/userData/userDataSlice'
import { getUserQuestions } from '@/controllers/db/userData/getUserData'

//mockData

interface Props {
	statement: Statement;
}

const UserDataSetting: FC<Props> = ({ statement }) => {
	const statementId = statement.statementId
	const { t } = useUserConfig()
	const dispatch = useDispatch()
	const [showModal, setShowModal] = useState(false)
	// Get user questions from Redux store filtered by statement ID
	const userQuestions = useSelector((state: RootState) =>
		selectUserQuestionsByStatementId(state, statement.statementId)
	)

	useEffect(() => {
		getUserQuestions(statementId)
	}, [statementId])

	function closeModal() {
		setShowModal(false)
	}
	const handleAddNewQuestion = (e: React.FormEvent) => {
		e.preventDefault()

		const form = e.target as HTMLFormElement
		const formData = new FormData(form)
		const newQuestion = formData.get('newQuestion') as string
		const newQuestionType = formData.get('questionType') as UserQuestionType

		if (!newQuestion.trim()) return;

		const newQuestionObj: UserQuestion = {
			userQuestionId: getRandomUID(),
			question: newQuestion.trim(),
			type: newQuestionType,
			statementId: statement.statementId,
			options: newQuestionType === UserQuestionType.checkbox || newQuestionType === UserQuestionType.radio ? [] : []
		};

		dispatch(setUserQuestion(newQuestionObj))

		// Reset the form
		form.reset();

		setUserDataQuestion(statement, newQuestionObj)
	}

	const handleDeleteQuestion = (questionIndex: number) => {
		const questionToDelete = userQuestions[questionIndex]
		if (questionToDelete && questionToDelete.userQuestionId) {
			// Find the actual index in the Redux store and dispatch delete action
			const storeIndex = userQuestions.findIndex(q => q.userQuestionId === questionToDelete.userQuestionId)
			if (storeIndex !== -1) {
				dispatch(deleteUserQuestion(questionToDelete.userQuestionId))
			}

			deleteUserDataQuestion(questionToDelete)
		}
	}
	const handleUpdateQuestion = (questionIndex: number, updatedQuestion: Partial<UserQuestion>) => {
		const questionToUpdate = userQuestions[questionIndex]
		if (questionToUpdate && questionToUpdate.userQuestionId) {
			const updatedQuestionObj: UserQuestion = {
				...questionToUpdate,
				...updatedQuestion
			}
			dispatch(setUserQuestion(updatedQuestionObj))
			setUserDataQuestion(statement, updatedQuestionObj)
		}
	}

	const handleAddOption = (questionIndex: number, newOption: string) => {
		if (!newOption.trim()) return

		const questionToUpdate = userQuestions[questionIndex]
		if (questionToUpdate && questionToUpdate.userQuestionId) {
			const updatedOptions = questionToUpdate.options ? [...questionToUpdate.options, newOption.trim()] : [newOption.trim()]
			const updatedQuestion: UserQuestion = {
				...questionToUpdate,
				options: updatedOptions
			}
			dispatch(setUserQuestion(updatedQuestion))
		}
	}

	const handleDeleteOption = (questionIndex: number, optionIndex: number) => {
		const questionToUpdate = userQuestions[questionIndex]
		if (questionToUpdate && questionToUpdate.userQuestionId && questionToUpdate.options) {
			const updatedOptions = questionToUpdate.options.filter((_, idx) => idx !== optionIndex)
			const updatedQuestion: UserQuestion = {
				...questionToUpdate,
				options: updatedOptions
			}
			dispatch(setUserQuestion(updatedQuestion))
		}
	}

	return (
		<div>
			<SectionTitle title={t('Member Information')} />
			<div className="btns">
				<button className='btn btn--secondary' onClick={() => setShowModal(true)}>{t('Edit')}</button>
			</div>			{showModal && <SettingsModal closeModal={closeModal}>
				<div className={styles.userDataSettings}>
					<h3>{t('User Data Questions')}</h3>					{/* New Question Form */}
					<form className={styles.newQuestionForm} onSubmit={handleAddNewQuestion}>
						<h4>{t('Add New Question')}</h4>
						<div className={styles.formFields}>
							<label htmlFor="questionType">
								{t('Question')}
							</label>
							<input
								name="newQuestion"
								placeholder={t('Enter your question')}
								required
								type="text"
							/>

							<div className={styles.selectField}>
								<label htmlFor="questionType">
									{t('Question Type')}
								</label>
								<select
									id="questionType"
									name="questionType"
									defaultValue={UserQuestionType.text}
								>
									<option value={UserQuestionType.text}>{t('Text Input')}</option>
									<option value={UserQuestionType.textarea}>{t('Text Area')}</option>
									<option value={UserQuestionType.checkbox}>{t('Multiple Choice (Checkbox)')}</option>
									<option value={UserQuestionType.radio}>{t('Single Choice (Radio)')}</option>
								</select>
							</div>
							<button
								type="submit"
								className="btn btn--add"
							>
								<PlusIcon />
								{t('Add Question')}
							</button>
						</div>
					</form>

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