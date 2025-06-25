import React, { FC, useState, JSX } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import SectionTitle from '../sectionTitle/SectionTitle'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import SettingsModal from '../settingsModal/SettingsModal'
import UserQuestionComp from './userQuestion/UserQuestionComp'
import PlusIcon from '@/assets/icons/plusIcon.svg?react'
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
	type: UserQuestionType;
	label: string;
	icon: JSX.Element;
}

const UserDataSetting: FC<Props> = ({ statement }) => {
	
	const options = [
  		{ type: UserQuestionType.radio, label: 'Multiple Choice', icon: <RadioIcon className={styles.optionIcon}/> },
];

	const { t } = useUserConfig()
	const dispatch = useDispatch()
	const [showModal, setShowModal] = useState(false)	// Get user questions from Redux store filtered by statement ID
	const [selectedOption, setSelectedOption] = useState<Option>((options[0]));
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
		const newQuestionType = selectedOption.type;

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
		console.info("h", selectedOption.label)
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
								<div className={styles.existingQuestions}>
						{userQuestions.map((question, index) => (
							<UserQuestionComp
								key={index}
								userQuestions={question}
								questionIndex={index}
								onAddOption={handleAddOption}
								onDeleteOption={handleDeleteOption}
								onDeleteQuestion={handleDeleteQuestion}
								onUpdateQuestion={handleUpdateQuestion}
							/>
						))}
						
					</div>
							<div className={styles.bottom}>
								<div>
									<h3 className={styles.switcherText}>required</h3>		
								</div>
								<div>

								</div>
								
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
					
					{userQuestions.map((question, questionIndex) => (
						<div key={question.userQuestionId ?? questionIndex} className={styles.existingQuestion}>
						<h4>{question.question}</h4>
							{question.options.map((option, optionIndex) => (
							<div key={optionIndex} className={styles.optionItem}>
								<RadioIcon className={styles.radioIcon} />
								<h3>{option.option}</h3>
								<input
								type="color"
								name={`user-question-${questionIndex}-${optionIndex}`}
								value={option.color ?? '#000000'}
								// onChange={(e) => handleChangeOptionColor(questionIndex, optionIndex, e.target.value)}
								// onBlur={(e) => handleChangeOptionColor(questionIndex, optionIndex, e.target.value)}
								/>
								{/* <DeleteIcon
								className={styles.deleteIcon}
								onClick={() => handleDeleteOption(questionIndex, optionIndex)}
								title={t('Delete Option')}
								/> */}
								</div>
								))}
							</div>
							))}
				</div>
			</SettingsModal>}
		</div>
	)
}

export default UserDataSetting