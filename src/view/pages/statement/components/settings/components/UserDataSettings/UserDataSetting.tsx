import React, { FC, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import SectionTitle from '../sectionTitle/SectionTitle';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import SettingsModal from '../settingsModal/SettingsModal';
import UserQuestionComp from './userQuestion/UserQuestionComp';
import styles from './UserDataSetting.module.scss';
import {
	getRandomUID,
	Statement,
	UserQuestion,
	UserQuestionType,
} from 'delib-npm';
import {
	deleteUserDataOption,
	deleteUserDataQuestion,
	setUserDataOption,
	setUserDataQuestion,
} from '@/controllers/db/userData/setUserData';
import {
	setUserQuestion,
	deleteUserQuestion,
	selectUserQuestionsByStatementId,
} from '@/redux/userData/userDataSlice';
import { getRandomColor } from '@/controllers/general/helpers';
import CheckIcon from '@/assets/icons/checkIcon.svg?react';
import BackToMenuArrow from '@/assets/icons/backToMenuArrow.svg?react';
import X from '@/assets/icons/x.svg?react';
import RadioButtonEmptyIcon from '@/assets/icons/radioButtonEmpty.svg?react';
import DeleteIcon from '@/assets/icons/delete.svg?react';
//mockData

interface Props {
	statement: Statement;
}
interface Option {
	option: string;
	color: string;
}

const UserDataSetting: FC<Props> = ({ statement }) => {
	const { t } = useUserConfig();
	const dispatch = useDispatch();
	const [showModal, setShowModal] = useState(false); // Get user questions from Redux store filtered by statement ID
	const userQuestions: UserQuestion[] = useSelector(
		selectUserQuestionsByStatementId(statement.statementId)
	);
	const defaultOptions: Option[] = [
		{ option: '', color: '#0000ff' },
		{ option: '', color: '#ff0000' },
	];
	const [isQuestionRequired, setIsQuestionRequired] = useState(true);
	const [options, setOptions] = useState<Option[]>(defaultOptions);
	function closeModal() {
		setShowModal(false);
	}
	const switchRequired = () => {
		//TODO:uncomment when the ability to change required exists
		setIsQuestionRequired(true);
	};
	const minQuestionAmount = 2;
	const allowDelete = options.length > minQuestionAmount;
	const handleAddNewQuestion = (e: React.FormEvent) => {
		e.preventDefault();

		const form = e.target as HTMLFormElement;
		const formData = new FormData(form);
		const newQuestion = formData.get('newQuestion') as string;
		const newQuestionType = formData.get(
			'questionType'
		) as UserQuestionType;

		if (!newQuestion.trim()) return;

		const newQuestionObj: UserQuestion = {
			userQuestionId: getRandomUID(),
			question: newQuestion.trim(),
			type: newQuestionType,
			statementId: statement.statementId,
			options:
				newQuestionType === UserQuestionType.checkbox ||
				newQuestionType === UserQuestionType.radio
					? options
					: [],
		};

		dispatch(setUserQuestion(newQuestionObj));

		// Reset the form
		form.reset();
		setOptions(
			defaultOptions.map((option) => ({
				...option,
				color: getRandomColor(),
			}))
		);
		setUserDataQuestion(statement, newQuestionObj);
	};

	const handleDeleteQuestion = (questionIndex: number) => {
		const questionToDelete = userQuestions[questionIndex];
		if (questionToDelete && questionToDelete.userQuestionId) {
			// Find the actual index in the Redux store and dispatch delete action
			const storeIndex = userQuestions.findIndex(
				(q) => q.userQuestionId === questionToDelete.userQuestionId
			);
			if (storeIndex !== -1) {
				dispatch(deleteUserQuestion(questionToDelete.userQuestionId));
			}

			deleteUserDataQuestion(questionToDelete);
		}
	};
	const handleUpdateQuestion = (
		questionIndex: number,
		updatedQuestion: Partial<UserQuestion>
	) => {
		const questionToUpdate = userQuestions[questionIndex];
		if (questionToUpdate && questionToUpdate.userQuestionId) {
			const updatedQuestionObj: UserQuestion = {
				...questionToUpdate,
				...updatedQuestion,
			};
			dispatch(setUserQuestion(updatedQuestionObj));
			setUserDataQuestion(statement, updatedQuestionObj);
		}
	};
	const createNewOption = () => {
		setOptions([...options, { option: '', color: getRandomColor() }]);
	};
	const deleteOption = (index: number) => {
		setOptions(options.filter((_, idx) => idx !== index));
	};
	const handleOptionChange = (
		e: React.ChangeEvent<HTMLInputElement>,
		index: number
	) => {
		const value = e.target.value;
		setOptions((prev) =>
			prev.map((opt, i) =>
				i === index ? { ...opt, option: value } : opt
			)
		);
	};
	const handleColorChange = (
		e: React.ChangeEvent<HTMLInputElement>,
		index: number
	) => {
		const value = e.target.value;
		setOptions((prev) =>
			prev.map((opt, i) => (i === index ? { ...opt, color: value } : opt))
		);
	};
	const handleAddOption = (questionIndex: number, newOption: string) => {
		if (!newOption.trim()) return;

		const questionToUpdate = userQuestions[questionIndex];

		if (questionToUpdate && questionToUpdate.userQuestionId) {
			const newOptionObj = {
				option: newOption.trim(),
				color: getRandomColor(),
			}; // You can set a default color or leave it empty
			const updatedOptions = questionToUpdate.options
				? [...questionToUpdate.options, newOptionObj]
				: [newOptionObj];
			const updatedQuestion: UserQuestion = {
				...questionToUpdate,
				options: updatedOptions,
			};
			dispatch(setUserQuestion(updatedQuestion));
			setUserDataOption(questionToUpdate, newOptionObj);
		}
	};

	const handleDeleteOption = (questionIndex: number, optionIndex: number) => {
		const questionToUpdate = userQuestions[questionIndex];
		if (
			questionToUpdate &&
			questionToUpdate.userQuestionId &&
			questionToUpdate.options
		) {
			const updatedOptions = questionToUpdate.options.filter(
				(_, idx) => idx !== optionIndex
			);
			const updatedQuestion: UserQuestion = {
				...questionToUpdate,
				options: updatedOptions,
			};
			dispatch(setUserQuestion(updatedQuestion));
		}
		deleteUserDataOption(
			questionToUpdate,
			questionToUpdate.options[optionIndex].option
		);
	};

	return (
		<div>
			<SectionTitle title={t('Member Information')} />
			<div className='btns'>
				<button
					className='btn btn--secondary'
					onClick={() => setShowModal(true)}
				>
					{t('Survey')}
				</button>
			</div>
			{showModal && (
				<SettingsModal
					closeModal={closeModal}
					isFullScreen={true}
					customCloseWord={t('Save Setting')}
				>
					<div className={styles.userDataSettings}>
						<div className={styles.topNavSurvey}>
							<BackToMenuArrow onClick={closeModal} />
							<div className={styles.spacer}></div>
							<X className={styles.XBtn} onClick={closeModal} />
						</div>
						<h3>{t('Survey setting')}</h3>
						{/* New Question Form */}
						<form
							className={styles.newQuestionForm}
							onSubmit={handleAddNewQuestion}
						>
							<input
								name='newQuestion'
								placeholder={t('Write Question here')}
								required
								type='text'
								className={styles.inputQuestion}
							/>
							<div className={styles.selectField}>
								<select
									id='questionType'
									name='questionType'
									defaultValue={UserQuestionType.text}
								>
									<option value={UserQuestionType.radio}>
										◉ {t(' Single Choice (Radio)')}
									</option>
								</select>
							</div>
							<div className={styles.addOptionContainer}>
								{options.map((option, indx) => (
									<div className={styles.option} key={indx}>
										<RadioButtonEmptyIcon />
										<input
											name={option.option}
											placeholder={t('Write Answer here')}
											required
											type='text'
											className={styles.inputAnswer}
											value={option.option}
											onChange={(e) =>
												handleOptionChange(e, indx)
											}
										/>
										<input
											type='color'
											className={styles.optionColor}
											onChange={(e) =>
												handleColorChange(e, indx)
											}
											value={option.color}
										/>
										<DeleteIcon
											color={
												allowDelete ? 'red' : 'white'
											}
											cursor={
												allowDelete
													? 'pointer'
													: 'default'
											}
											onClick={() =>
												allowDelete
													? deleteOption(indx)
													: ''
											}
										></DeleteIcon>
									</div>
								))}
								<div
									className={styles.addOption}
									onClick={createNewOption}
								>
									<h4>{t('add more options')}</h4>
								</div>

								<div className={styles.bottomBar}>
									<h4>Required</h4>
									<div
										className={styles.slideButtonContainer}
										onClick={switchRequired}
										style={{
											backgroundColor: isQuestionRequired
												? 'var(--text-blue)'
												: '',
										}}
									>
										<div
											className={`${styles.slideButtonHandle} ${isQuestionRequired ? styles.active : styles.inactive}`}
										></div>
									</div>
									<div className={styles.spacer}></div>
									<button>
										<CheckIcon
											className={styles.checkIcon}
										/>
									</button>
								</div>
							</div>
						</form>
						{/* Existing Questions */}
						<div className={styles.existingQuestions}>
							{userQuestions.length === 0 ? (
								<p className={styles.emptyState}>
									{t('No questions added yet')}
								</p>
							) : (
								userQuestions.map((question, index) => (
									<UserQuestionComp
										key={question.answer}
										userQuestions={question}
										questionIndex={index}
										minQuestionAmount={minQuestionAmount}
										onAddOption={handleAddOption}
										onDeleteOption={handleDeleteOption}
										onDeleteQuestion={handleDeleteQuestion}
										onUpdateQuestion={handleUpdateQuestion}
									/>
								))
							)}
						</div>
					</div>
				</SettingsModal>
			)}
		</div>
	);
};

export default UserDataSetting;
