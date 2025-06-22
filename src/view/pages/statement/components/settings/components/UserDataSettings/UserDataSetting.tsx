import React, { FC, useState, JSX } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import SectionTitle from '../sectionTitle/SectionTitle'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import SettingsModal from '../settingsModal/SettingsModal'
import UserQuestionComp from './userQuestion/UserQuestionComp'
import PlusIcon from '@/assets/icons/plusIcon.svg?react'
import CheckboxIcon from '@/assets/icons/checkboxCheckedIcon.svg?react'
import MenuDropdown from '@/assets/icons/arrow-down.svg?react'
import RadioIcon from '@/assets/icons/radioButtonChecked.svg?react'
import styles from './UserDataSetting.module.scss'
import { getRandomUID, Statement, UserQuestion, UserQuestionType } from 'delib-npm'
import { deleteUserDataOption, deleteUserDataQuestion, setUserDataOption, setUserDataQuestion } from '@/controllers/db/userData/setUserData'
import { setUserQuestion, deleteUserQuestion, selectUserQuestionsByStatementId } from '@/redux/userData/userDataSlice'

//mockData

interface Props {
	statement: Statement;
}

interface Option {
	type: string;
	label: string;
	icon: JSX.Element;
}

const UserDataSetting: FC<Props> = ({ statement }) => {
	
	const options = [
  		{ type: 'text', label: 'Short Answer', icon: <CheckboxIcon className={styles.optionIcon}/> },
  		{ type: 'checkbox', label: 'Checkbox', icon: <CheckboxIcon className={styles.optionIcon}/> },
  		{ type: 'paragraph', label: 'Paragraph', icon: <CheckboxIcon className={styles.optionIcon}/> },
  		{ type: 'radio', label: 'Multiple Choice', icon: <RadioIcon className={styles.optionIcon}/> },
];

	const { t } = useUserConfig()
	const dispatch = useDispatch()
	const [showModal, setShowModal] = useState(false)	// Get user questions from Redux store filtered by statement ID
	const [selectedOption, setSelectedOption] = useState<Option>((options[3]));
  	const [open, setOpen] = useState(false);
	const userQuestions: UserQuestion[] = useSelector(selectUserQuestionsByStatementId(statement.statementId));

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
			const newOptionObj = { option: newOption.trim(), color: '' } // You can set a default color or leave it empty
			const updatedOptions = questionToUpdate.options ? [...questionToUpdate.options, newOptionObj] : [newOptionObj]
			const updatedQuestion: UserQuestion = {
				...questionToUpdate,
				options: updatedOptions
			}
			dispatch(setUserQuestion(updatedQuestion))
			setUserDataOption(questionToUpdate, newOptionObj);
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
		deleteUserDataOption(questionToUpdate, questionToUpdate.options[optionIndex].option);
	}

	const handleSelectOption = (option) => {
		setSelectedOption((option));
		setOpen(false);
  };

	return (
		<div>
			<SectionTitle title={t('Member Information')} />
			<div className="btns">
				<button className='btn btn--secondary' onClick={() => setShowModal(true)}>{t('Edit')}</button>
			</div>
			{showModal && <SettingsModal closeModal={closeModal}>
				<div className={styles.userDataSettings}>
					<h3>{t('Survey Settings')}</h3>					{/* New Question Form */}
					<form className={styles.newQuestionForm} onSubmit={handleAddNewQuestion}>
						<div className={styles.formFields}>
							<input
								name="newQuestion"
								placeholder={t('White Question Here...')}
								required
								type="text"
								className={styles.questionInput}
							/>
							<div 
 								className={styles.selectField} 
								onClick={() => setOpen(!open)} 
								role="button"
								tabIndex={0}
								onKeyDown={(e) => e.key === 'Enter' && setOpen(!open)}>
									<div className={styles.selectFieldWrapper}>
										<div className={styles.option}>
											<span>{selectedOption.icon}</span>
											<span className={styles.textLabel}>{selectedOption.label}</span>
										</div>
										<MenuDropdown className={styles.optionIcon}/>
									</div>
							</div>
							{open && (
							<div className={styles.options}>
								{options.map((option) => (
								<button
									key={option.type}
									className={styles.option}
									onClick={() => {
										handleSelectOption(option);
									}}
								>
									{option.icon}
									<span className={styles.textLabel}>{option.label} </span>
								</button>
								))}
							</div>
							)}
							{selectedOption.type === 'radio' ?
					<div className={styles.existingQuestions}>
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
					: null}
							<div>
								<h3>required</h3>
							</div>
							
						</div>
					</form>

						<button
							type="submit"
							className="btn btn--add"
							onClick={handleAddNewQuestion}
						>
						<PlusIcon />
						</button>
				</div>
			</SettingsModal>}
		</div>
	)
}

export default UserDataSetting