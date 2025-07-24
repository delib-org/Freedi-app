import React, { useState } from 'react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import Input from '@/view/components/input/Input';
import styles from './UserQuestionComp.module.scss';
import { DemographicOption, UserQuestion, UserQuestionType } from 'delib-npm';
import { setDemographicOptionColor } from '@/controllers/db/userData/setUserData';
import { useDispatch } from 'react-redux';
import { updateUserQuestionOptionColor } from '@/redux/userData/userDataSlice';
import RadioButtonEmptyIcon from '@/assets/icons/radioButtonEmpty.svg?react';
import X from '@/assets/icons/x.svg?react';

interface Props {
	userQuestions: UserQuestion;
	questionIndex: number;
	onAddOption: (questionIndex: number, newOption: string) => void;
	onDeleteOption: (questionIndex: number, optionIndex: number) => void;
	onDeleteQuestion: (questionIndex: number) => void;
	onUpdateQuestion?: (
		questionIndex: number,
		updatedQuestion: Partial<UserQuestion>
	) => void;
	minQuestionAmount?: number;
}

const UserQuestionComp = ({
	userQuestions,
	questionIndex,
	onAddOption,
	onDeleteOption,
	onDeleteQuestion,
	onUpdateQuestion,
	minQuestionAmount = 2,
}: Props) => {
	const { t } = useUserConfig();
	const dispatch = useDispatch();
	const [newOptionText, setNewOptionText] = useState('');
	const [isEditingQuestion, setIsEditingQuestion] = useState(false);
	const [editedQuestionText, setEditedQuestionText] = useState(
		userQuestions.question
	);
	const [selectedType, setSelectedType] = useState(userQuestions.type);
	const [addOptionMenuOpen, setAddOptionMenuOpen] = useState(false);

	const allowDelete = userQuestions.options.length > minQuestionAmount;

	const isMultiOptions =
		userQuestions.type === UserQuestionType.checkbox ||
		userQuestions.type === UserQuestionType.radio;

	const handleAddOption = () => {
		if (newOptionText.trim()) {
			onAddOption(questionIndex, newOptionText);
			setNewOptionText('');
			setAddOptionMenuOpen(false);
		}
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && newOptionText.trim()) {
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
				type: selectedType,
			});
			setIsEditingQuestion(false);
		}
	};

	const handleCancelEdit = () => {
		setEditedQuestionText(userQuestions.question);
		setSelectedType(userQuestions.type);
		setIsEditingQuestion(false);
	};

	const handleTypeChange = (newType: UserQuestionType) => {
		setSelectedType(newType);
		if (onUpdateQuestion) {
			// If changing to/from multi-option types, handle options appropriately
			const needsOptions =
				newType === UserQuestionType.checkbox ||
				newType === UserQuestionType.radio;
			const currentHasOptions =
				userQuestions.options && userQuestions.options.length > 0;

			onUpdateQuestion(questionIndex, {
				type: newType,
				options: needsOptions
					? currentHasOptions
						? userQuestions.options
						: []
					: undefined,
			});
		}
	};

	function handleChangeOptionColor(optionIndex: number, color: string) {
		dispatch(
			updateUserQuestionOptionColor({
				userQuestionId: userQuestions.userQuestionId,
				option: userQuestions.options[optionIndex].option,
				color: color,
			})
		);

		setDemographicOptionColor(userQuestions, {
			option: userQuestions.options[optionIndex].option,
			color: color,
		});
	}

	return (
		<div className={styles.userQuestion}>
			<div className={styles.questionHeader}>
				{isEditingQuestion ? (
					<div className={styles.editQuestionForm}>
						<Input
							name='editQuestion'
							label=''
							placeholder={t('Enter question text')}
							value={editedQuestionText}
							onChange={(value) => setEditedQuestionText(value)}
						/>
						<div className={styles.editActions}>
							<button
								className='btn btn--primary btn--small'
								onClick={handleSaveQuestion}
								disabled={!editedQuestionText.trim()}
							>
								{t('Save')}
							</button>
							<button
								className='btn btn--secondary btn--small'
								onClick={handleCancelEdit}
							>
								{t('Cancel')}
							</button>
						</div>
					</div>
				) : (
					<>
						<p
							className={styles.questionTitle}
							onClick={() => setIsEditingQuestion(true)}
						>
							{userQuestions.question}
						</p>
						<div className={styles.questionActions}>
							<div className={styles.typeSelector}>
								<select
									value={selectedType}
									onChange={(e) =>
										handleTypeChange(
											e.target.value as UserQuestionType
										)
									}
									className={styles.typeSelect}
								>
									<option value={UserQuestionType.radio}>
										{t('Radio')}
									</option>
								</select>
							</div>
							{}
							<DeleteIcon
								className={styles.deleteQuestionIcon}
								onClick={() => onDeleteQuestion(questionIndex)}
								title={t('Delete Question')}
							/>
						</div>
					</>
				)}
			</div>

			{/* Question Preview */}

			{userQuestions.type === UserQuestionType.radio && (
				<div>
					{userQuestions.options?.map(
						(option: DemographicOption, index: number) => (
							<div key={index} className={styles.optionItem}>
								<RadioButtonEmptyIcon />
								{option.option}
								<div className={styles.spacer}></div>
								<input
									type='color'
									name={`user-question-${questionIndex}-${index}`}
									value={option.color}
									className={styles.optionColor}
									onChange={(e) =>
										handleChangeOptionColor(
											index,
											e.target.value
										)
									}
									onBlur={(e) =>
										handleChangeOptionColor(
											index,
											e.target.value
										)
									}
								/>
								<DeleteIcon
									color={allowDelete ? 'red' : 'white'}
									cursor={allowDelete ? 'pointer' : 'default'}
									onClick={() =>
										allowDelete
											? handleDeleteOption(index)
											: ''
									}
									title={t('Delete Option')}
								/>
							</div>
						)
					)}
				</div>
			)}
			{isMultiOptions && (
				<div className={styles.addOptionSection}>
					{addOptionMenuOpen ? (
						<>
							<div onKeyDown={handleKeyPress}>
								<Input
									name='newOption'
									label={t('New Option')}
									placeholder={t('Enter new Answer')}
									value={newOptionText}
									onChange={(value) =>
										setNewOptionText(value)
									}
								/>
							</div>
							<div className='btns'>
								<button
									className='btn btn--secondary btn--big'
									onClick={handleAddOption}
									disabled={!newOptionText.trim()}
								>
									<PlusIcon />
									{t('Add')}
								</button>
								<button
									className='btn btn--secondary btn--big'
									onClick={() => setAddOptionMenuOpen(false)}
								>
									<X />
									{t('Cancel')}
								</button>
							</div>
						</>
					) : (
						<div className={styles.addOptionPlus}>
							<PlusIcon
								onClick={() => setAddOptionMenuOpen(true)}
								className={styles.plusIcon}
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default UserQuestionComp;
