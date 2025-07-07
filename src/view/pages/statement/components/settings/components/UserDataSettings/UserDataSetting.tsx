import React, { FC, useState, JSX } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import SectionTitle from '../sectionTitle/SectionTitle'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import SettingsModal from '../settingsModal/SettingsModal'
import UserQuestionComp from './userQuestion/UserQuestionComp'
import PlusIcon from '@/assets/icons/plusIcon.svg?react'
import DeleteIcon from '@/assets/icons/delete.svg?react';
import MenuDropdown from '@/assets/icons/arrow-down.svg?react'
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react'
import RadioIcon from '@/assets/icons/radioButtonChecked.svg?react'
import styles from './UserDataSetting.module.scss'
import { getRandomUID, Statement, UserQuestion, UserQuestionType } from 'delib-npm'
import { deleteUserDataOption, deleteUserDataQuestion, setUserDataOption, setUserDataQuestion } from '@/controllers/db/userData/setUserData'
import { setUserQuestion, deleteUserQuestion, selectUserQuestionsByStatementId } from '@/redux/userData/userDataSlice'
import CustomSwitchSmall from '@/view/components/switch/customSwitchSmall/CustomSwitchSmall'

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
	const [openDeleteQuestion, setOpenDeleteQuestion] = useState(false);
	const userQuestions: UserQuestion[] = useSelector(selectUserQuestionsByStatementId(statement.statementId));
	const [newQuestionText, setNewQuestionText] = useState('');
	const [newQuestionRequired, setNewQuestionRequired] = useState(false);

	const [newCardCreate, setNewCardCreate] = useState(true);
	
	function closeModal() {
		setShowModal(false)
	}

	const handleQuestionInputChange = (value: string) => {
		setNewQuestionText(value);
	};

	const handleAddNewQuestion = () => {
		 const newQuestion = newQuestionText.trim();
		if (!newQuestion) return;

			const newQuestionObj: UserQuestion = {
				userQuestionId: getRandomUID(),
				question: newQuestion,
				type: selectedOption.type,
				statementId: statement.statementId,
				options: [],
				required: newQuestionRequired,
			};

			setNewQuestionRequired(false);
			setNewCardCreate(false);
			setNewQuestionText('');
			dispatch(setUserQuestion(newQuestionObj));
			setUserDataQuestion(statement, newQuestionObj);
  		// }
	}

	const handleKeyPressOnAddQuestion = (e: React.KeyboardEvent<HTMLInputElement>) => {
  		if (e.key === 'Enter') {
    		e.preventDefault();
    		handleAddNewQuestion();
  		}
	};

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
	};

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

  const handleRequiredQuestion = (questionIndex: number, isChecked: boolean) => {
	const question = userQuestions[questionIndex];
	if (!question || !question.userQuestionId) return;

	const updatedQuestion = { ...question, required: isChecked };

	dispatch(setUserQuestion(updatedQuestion));
	setUserDataQuestion(statement, updatedQuestion);
};

	return (
		<div>
			<SectionTitle title={t('Member Information')} />
			<div className="btns">
				<button className='btn btn--secondary' onClick={() => setShowModal(true)}>{t('Edit')}</button>
			</div>
			{showModal && <SettingsModal closeModal={closeModal}>
				<div className={styles.userDataSettings}>
					<h3>{t('Survey Settings')}</h3>	
					{newCardCreate && 	
					<div className={styles.newQuestionForm} >			{/* New Question Form */}
						<div className={styles.formFields}>
							<input
								name="newQuestion"
								value={newQuestionText}
								onChange={(e) => handleQuestionInputChange(e.target.value)}
								onKeyDown={handleKeyPressOnAddQuestion}
								onBlur={() => handleAddNewQuestion()}
								placeholder={t('Write question here...')}
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
							<div className={styles.bottomSection}>
								<div className={styles.requiredSection}>
									<h3 className={styles.switcherText}>required</h3>
									<CustomSwitchSmall
										label='Document Question'
										checked={newQuestionRequired}
										setChecked={setNewQuestionRequired}
										textChecked={t('')}
										textUnchecked={t('')}
										imageChecked={""}
										imageUnchecked={""}
									/>		
								</div>
								<EllipsisIcon 
									className={styles.ellipsisIcon}
									onClick={() => setOpenDeleteQuestion(!openDeleteQuestion)}/>
							</div>
							{ openDeleteQuestion && <button className={styles.deleteQuestionBtn} onClick={() => setNewCardCreate(false)}>
									<DeleteIcon 
										className={styles.deleteIcon} />
									<h3 className={styles.deleteQuestionText}>Delete</h3>
								</button> } 
						</div>
					</div>}	

					{/* Existing Questions */}
						{userQuestions.reverse().map((question, index) => (
							<UserQuestionComp
								key={index}
								userQuestions={question}
								questionIndex={index}
								onAddOption={handleAddOption}
								onDeleteOption={handleDeleteOption}
								onDeleteQuestion={handleDeleteQuestion}
								onUpdateQuestion={handleUpdateQuestion}
								onRequiredQuestion={handleRequiredQuestion}
							/>
						))}
						<div className={styles.modalButtons}>
							<button
									type="submit"
									className={`btn ${styles.buttonSave}`}
								>
									{t("Save settings")}
							</button>
							<button
									type="submit"
									className={`btn btn--add ${styles.buttonAdd}`}
									onClick={() => setNewCardCreate(true)}
								>
									<PlusIcon />
							</button>
						</div>
				</div>
			</SettingsModal>}
		</div>
	)
}

export default UserDataSetting