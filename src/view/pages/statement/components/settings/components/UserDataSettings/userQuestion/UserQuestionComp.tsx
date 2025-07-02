import React, { useState } from 'react'
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import RadioIcon from '@/assets/icons/radioButtonEmpty.svg?react'
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react'
import styles from './UserQuestionComp.module.scss';
import { DemographicOption, UserQuestion, UserQuestionType } from 'delib-npm';
import { setDemographicOptionColor } from '@/controllers/db/userData/setUserData';
import { useDispatch } from 'react-redux';
import { updateUserQuestionOptionColor } from '@/redux/userData/userDataSlice';
import CustomSwitchSmall from '@/view/components/switch/customSwitchSmall/CustomSwitchSmall';

interface Props {
	userQuestions: UserQuestion;
	questionIndex: number;
	onAddOption: (questionIndex: number, newOption: string) => void;
	onDeleteOption: (questionIndex: number, optionIndex: number) => void;
	onDeleteQuestion: (questionIndex: number) => void;
	onUpdateQuestion?: (questionIndex: number, updatedQuestion: Partial<UserQuestion>) => void;
}

const UserQuestionComp = ({ userQuestions, questionIndex, onAddOption, onDeleteOption, onDeleteQuestion, onUpdateQuestion }: Props) => {
	const { t } = useUserConfig();
	const dispatch = useDispatch();
	const [newOptionText, setNewOptionText] = useState('');
	const [isEditingQuestion, setIsEditingQuestion] = useState(false);
	const [editedQuestionText, setEditedQuestionText] = useState(userQuestions.question);
	const [selectedType, setSelectedType] = useState(userQuestions.type);
	const [openDeleteQuestion, setOpenDeleteQuestion] = useState(false);

	const isMultiOptions = userQuestions.type === UserQuestionType.checkbox || userQuestions.type === UserQuestionType.radio;

	const handleAddOption = () => {
		if (newOptionText.trim()) {
			console.info("text:", newOptionText)
			onAddOption(questionIndex, newOptionText);
		}
		setNewOptionText('');
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAddOption();
		}
	};

	const handleDeleteOption = (optionIndex: number) => {
		onDeleteOption(questionIndex, optionIndex);
	};

	const handleSaveQuestion = () => {
		if (onUpdateQuestion && editedQuestionText.trim()) {
			onUpdateQuestion(questionIndex, {
				question: editedQuestionText.trim(),
				type: selectedType
			});
			setIsEditingQuestion(false);
		}
	};

	const handleCancelEdit = () => {
		setEditedQuestionText(userQuestions.question);
		setSelectedType(userQuestions.type);
		setIsEditingQuestion(false);
	};

	// const handleTypeChange = (newType: UserQuestionType) => {
	// 	setSelectedType(newType);
	// 	if (onUpdateQuestion) {
	// 		// If changing to/from multi-option types, handle options appropriately
	// 		const needsOptions = newType === UserQuestionType.checkbox || newType === UserQuestionType.radio;
	// 		const currentHasOptions = userQuestions.options && userQuestions.options.length > 0;

	// 		onUpdateQuestion(questionIndex, {
	// 			type: newType,
	// 			options: needsOptions ? (currentHasOptions ? userQuestions.options : []) : undefined
	// 		});
	// 	}
	// };

  const handleRequiredQuestion = () => {

  }

	function handleChangeOptionColor(optionIndex: number, color: string) {

		dispatch(updateUserQuestionOptionColor({ userQuestionId: userQuestions.userQuestionId, option: userQuestions.options[optionIndex].option, color: color }));

		setDemographicOptionColor(userQuestions, {
			option: userQuestions.options[optionIndex].option,
			color: color
		});

	}

	return (
		<div className={styles.userQuestion}>
			<div className={styles.questionHeader}>
				{isEditingQuestion ? (
					<div className={styles.editQuestionForm}>
						<input
							name="editQuestion"
							value={editedQuestionText}
							placeholder={t('Enter question text')}
							className={styles.editQuestionInput}
							onChange={(e) => setEditedQuestionText(e.target.value)}
						/>
						<div className={styles.editActions}>
							<button
								className="btn btn--primary btn--small"
								onClick={handleSaveQuestion}
								disabled={!editedQuestionText.trim()}
							>
								{t('Save')}
							</button>
							<button
								className="btn btn--secondary btn--small"
								onClick={handleCancelEdit}
							>
								{t('Cancel')}
							</button>
						</div>
					</div>
				) : (
					<>
						<p className={styles.questionTitle} onClick={() => setIsEditingQuestion(true)}>
							{userQuestions.question}
						</p>
						<div className={styles.questionActions}>
							<div className={styles.typeSelector}>
							</div>
						</div>
					</>
				)}
			</div>

			{/* Question Preview */}

			{userQuestions.type === UserQuestionType.radio && (
				<div>
					{userQuestions.options?.map((option: DemographicOption, index: number) => (
						<div key={index} className={styles.optionItem}>
							<RadioIcon className={styles.RadioIcon}/>
							{option.option}
							<input
								type="color"
								name={`user-question-${questionIndex}-${index}`}
								value={option.color}
								onChange={(e) => handleChangeOptionColor(index, e.target.value)}
								onBlur={(e) => handleChangeOptionColor(index, e.target.value)}
							/>
							<DeleteIcon
								className={styles.deleteIcon}
								onClick={() => handleDeleteOption(index)}
								title={t('Delete Option')}
							/>
						</div>
					))}
				</div>
			)}
			{isMultiOptions && (
				<div className={styles.addOptionSection}>
					<div onKeyDown={handleKeyPress}>
						<input
							name="newOption"
							placeholder={t('Enter new option')}
							className={styles.newOptionInput}
							value={newOptionText}
							onChange={(e) => setNewOptionText(e.target.value)}
						/>
					</div>
					<div className="btns">
						<button
							className={styles.addOptionBtn}
							onClick={handleAddOption}
							disabled={!newOptionText.trim()}
						>
							{t('Add New Option')}
						</button>
					</div>
				</div>
			)}
			<div className={styles.BottomSection}>
				<div className={styles.requiredSection}>
				<h3 className={styles.switcherText}>required</h3>
					<CustomSwitchSmall
						label='Document Question'
						checked={false}
						setChecked={handleRequiredQuestion}
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
				{ openDeleteQuestion && <button className={styles.deleteQuestionBtn} onClick={() => onDeleteQuestion(questionIndex)}>
					<DeleteIcon className={styles.deleteIcon}/>
					<h3 className={styles.deleteQuestionText}>Delete</h3>
				</button> }

		</div>
	)
}

export default UserQuestionComp