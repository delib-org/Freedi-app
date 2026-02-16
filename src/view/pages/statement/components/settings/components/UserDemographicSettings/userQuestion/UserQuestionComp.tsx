import React, { useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import Input from '@/view/components/input/Input';
import styles from './UserQuestionComp.module.scss';
import {
	DemographicOption,
	UserDemographicQuestion,
	UserDemographicQuestionType,
	DemographicQuestionScope,
} from '@freedi/shared-types';
import { setDemographicOptionColor } from '@/controllers/db/userDemographic/setUserDemographic';
import { useDispatch } from 'react-redux';
import { updateUserDemographicQuestionOptionColor } from '@/redux/userDemographic/userDemographicSlice';
import RadioButtonEmptyIcon from '@/assets/icons/radioButtonEmpty.svg?react';
import CheckboxEmptyIcon from '@/assets/icons/checkboxEmptyIcon.svg?react';
import X from '@/assets/icons/x.svg?react';

// Use string literals for scope since delib-npm exports DemographicQuestionScope as type-only
const DEMOGRAPHIC_SCOPE_GROUP: DemographicQuestionScope = 'group' as DemographicQuestionScope;
const DEMOGRAPHIC_SCOPE_STATEMENT: DemographicQuestionScope =
	'statement' as DemographicQuestionScope;

interface Props {
	userQuestions: UserDemographicQuestion;
	questionIndex: number;
	onAddOption: (questionIndex: number, newOption: string) => void;
	onDeleteOption: (questionIndex: number, optionIndex: number) => void;
	onDeleteQuestion: (questionIndex: number) => void;
	onUpdateQuestion?: (
		questionIndex: number,
		updatedQuestion: Partial<UserDemographicQuestion>,
	) => void;
	minQuestionAmount?: number;
	isTopParent?: boolean;
}

const UserQuestionComp = ({
	userQuestions,
	questionIndex,
	onAddOption,
	onDeleteOption,
	onDeleteQuestion,
	onUpdateQuestion,
	minQuestionAmount = 2,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	isTopParent = false,
}: Props) => {
	const { t } = useTranslation();
	const dispatch = useDispatch();
	const [newOptionText, setNewOptionText] = useState('');
	const [isEditingQuestion, setIsEditingQuestion] = useState(false);
	const [editedQuestionText, setEditedQuestionText] = useState(userQuestions.question);
	const [selectedType, setSelectedType] = useState(userQuestions.type);
	const [addOptionMenuOpen, setAddOptionMenuOpen] = useState(false);

	const allowDelete = userQuestions.options.length > minQuestionAmount;

	const isMultiOptions =
		userQuestions.type === UserDemographicQuestionType.checkbox ||
		userQuestions.type === UserDemographicQuestionType.radio ||
		userQuestions.type === UserDemographicQuestionType.dropdown;

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

	const handleTypeChange = (newType: UserDemographicQuestionType) => {
		setSelectedType(newType);
		if (onUpdateQuestion) {
			// If changing to/from multi-option types, handle options appropriately
			const needsOptions =
				newType === UserDemographicQuestionType.checkbox ||
				newType === UserDemographicQuestionType.radio ||
				newType === UserDemographicQuestionType.dropdown;
			const currentHasOptions = userQuestions.options && userQuestions.options.length > 0;

			onUpdateQuestion(questionIndex, {
				type: newType,
				options: needsOptions ? (currentHasOptions ? userQuestions.options : []) : undefined,
			});
		}
	};

	function handleChangeOptionColor(optionIndex: number, color: string) {
		dispatch(
			updateUserDemographicQuestionOptionColor({
				userQuestionId: userQuestions.userQuestionId,
				option: userQuestions.options[optionIndex].option,
				color: color,
			}),
		);

		setDemographicOptionColor(userQuestions, {
			option: userQuestions.options[optionIndex].option,
			color: color,
		});
	}

	const handleScopeToggle = (applyToGroup: boolean) => {
		if (onUpdateQuestion) {
			onUpdateQuestion(questionIndex, {
				scope: applyToGroup ? DEMOGRAPHIC_SCOPE_GROUP : DEMOGRAPHIC_SCOPE_STATEMENT,
			});
		}
	};

	const isGroupScope = userQuestions.scope === DEMOGRAPHIC_SCOPE_GROUP;

	return (
		<div className={styles.userQuestion}>
			<div className={styles.questionHeader}>
				{isEditingQuestion ? (
					<div className={styles.editQuestionForm}>
						<Input
							name="editQuestion"
							label=""
							placeholder={t('Enter question text')}
							value={editedQuestionText}
							onChange={(value) => setEditedQuestionText(value)}
						/>
						<div className={styles.editActions}>
							<button
								className="btn btn--primary btn--small"
								onClick={handleSaveQuestion}
								disabled={!editedQuestionText.trim()}
							>
								{t('Save')}
							</button>
							<button className="btn btn--secondary btn--small" onClick={handleCancelEdit}>
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
								<select
									value={selectedType}
									onChange={(e) => handleTypeChange(e.target.value as UserDemographicQuestionType)}
									className={styles.typeSelect}
								>
									<option value={UserDemographicQuestionType.text}>{t('Text Input')}</option>
									<option value={UserDemographicQuestionType.textarea}>{t('Text Area')}</option>
									<option value={UserDemographicQuestionType.radio}>{t('Radio')}</option>
									<option value={UserDemographicQuestionType.checkbox}>{t('Checkbox')}</option>
									<option value={UserDemographicQuestionType.dropdown}>{t('Dropdown')}</option>
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

			{userQuestions.type === UserDemographicQuestionType.text && (
				<div className={styles.previewSection}>
					<input
						type="text"
						placeholder={t('User will enter text here')}
						disabled
						className={styles.previewInput}
					/>
				</div>
			)}

			{userQuestions.type === UserDemographicQuestionType.textarea && (
				<div className={styles.previewSection}>
					<textarea
						placeholder={t('User will enter longer text here')}
						disabled
						className={styles.previewTextarea}
						rows={3}
					/>
				</div>
			)}

			{userQuestions.type === UserDemographicQuestionType.radio && (
				<div>
					{userQuestions.options?.map((option: DemographicOption, index: number) => (
						<div key={index} className={styles.optionItem}>
							<RadioButtonEmptyIcon />
							{option.option}
							<div className={styles.spacer}></div>
							<input
								type="color"
								name={`user-question-${questionIndex}-${index}`}
								value={option.color}
								className={styles.optionColor}
								onChange={(e) => handleChangeOptionColor(index, e.target.value)}
								onBlur={(e) => handleChangeOptionColor(index, e.target.value)}
							/>
							<DeleteIcon
								color={allowDelete ? 'red' : 'white'}
								cursor={allowDelete ? 'pointer' : 'default'}
								onClick={() => (allowDelete ? handleDeleteOption(index) : '')}
								title={t('Delete Option')}
							/>
						</div>
					))}
				</div>
			)}

			{userQuestions.type === UserDemographicQuestionType.checkbox && (
				<div>
					{userQuestions.options?.map((option: DemographicOption, index: number) => (
						<div key={index} className={styles.optionItem}>
							<CheckboxEmptyIcon />
							{option.option}
							<div className={styles.spacer}></div>
							<input
								type="color"
								name={`user-question-${questionIndex}-${index}`}
								value={option.color}
								className={styles.optionColor}
								onChange={(e) => handleChangeOptionColor(index, e.target.value)}
								onBlur={(e) => handleChangeOptionColor(index, e.target.value)}
							/>
							<DeleteIcon
								color={allowDelete ? 'red' : 'white'}
								cursor={allowDelete ? 'pointer' : 'default'}
								onClick={() => (allowDelete ? handleDeleteOption(index) : '')}
								title={t('Delete Option')}
							/>
						</div>
					))}
				</div>
			)}

			{userQuestions.type === UserDemographicQuestionType.dropdown && (
				<div>
					{userQuestions.options?.map((option: DemographicOption, index: number) => (
						<div key={index} className={styles.optionItem}>
							{option.option}
							<div className={styles.spacer}></div>
							<input
								type="color"
								name={`user-question-${questionIndex}-${index}`}
								value={option.color}
								className={styles.optionColor}
								onChange={(e) => handleChangeOptionColor(index, e.target.value)}
								onBlur={(e) => handleChangeOptionColor(index, e.target.value)}
							/>
							<DeleteIcon
								color={allowDelete ? 'red' : 'white'}
								cursor={allowDelete ? 'pointer' : 'default'}
								onClick={() => (allowDelete ? handleDeleteOption(index) : '')}
								title={t('Delete Option')}
							/>
						</div>
					))}
				</div>
			)}
			{isMultiOptions && (
				<div className={styles.addOptionSection}>
					{addOptionMenuOpen ? (
						<>
							<div onKeyDown={handleKeyPress}>
								<Input
									name="newOption"
									label={t('New Option')}
									placeholder={t('Enter new Answer')}
									value={newOptionText}
									onChange={(value) => setNewOptionText(value)}
								/>
							</div>
							<div className="btns">
								<button
									className="btn btn--secondary btn--big"
									onClick={handleAddOption}
									disabled={!newOptionText.trim()}
								>
									<PlusIcon />
									{t('Add')}
								</button>
								<button
									className="btn btn--secondary btn--big"
									onClick={() => setAddOptionMenuOpen(false)}
								>
									<X />
									{t('Cancel')}
								</button>
							</div>
						</>
					) : (
						<div className={styles.addOptionPlus}>
							<PlusIcon onClick={() => setAddOptionMenuOpen(true)} className={styles.plusIcon} />
						</div>
					)}
				</div>
			)}

			{/* Scope Toggle - Show for all statements */}
			<div className={styles.scopeToggle}>
				<label className={styles.scopeLabel}>
					<input
						type="checkbox"
						checked={isGroupScope}
						onChange={(e) => handleScopeToggle(e.target.checked)}
					/>
					<span>{t('Apply to all sub-discussions')}</span>
				</label>
				<p className={styles.scopeHint}>
					{isGroupScope
						? t('Members will answer these questions once when joining the group')
						: t('Members will answer these questions only for this discussion')}
				</p>
			</div>
		</div>
	);
};

export default UserQuestionComp;
