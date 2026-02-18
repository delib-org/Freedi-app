import React, { FC, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import SectionTitle from '../sectionTitle/SectionTitle';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import SettingsModal from '../settingsModal/SettingsModal';
import UserQuestionComp from './userQuestion/UserQuestionComp';
import styles from './UserDemographicSetting.module.scss';
import {
	getRandomUID,
	Statement,
	UserDemographicQuestion,
	UserDemographicQuestionType,
	DemographicQuestionScope,
} from '@freedi/shared-types';

// Use string literals for scope since delib-npm exports DemographicQuestionScope as type-only
const DEMOGRAPHIC_SCOPE_GROUP: DemographicQuestionScope = 'group' as DemographicQuestionScope;
const DEMOGRAPHIC_SCOPE_STATEMENT: DemographicQuestionScope =
	'statement' as DemographicQuestionScope;
import {
	deleteUserDemographicOption,
	deleteUserDemographicQuestion as deleteUserDemographicQuestionDB,
	setUserDemographicOption,
	setUserDemographicQuestion as setUserDemographicQuestionDB,
} from '@/controllers/db/userDemographic/setUserDemographic';
import {
	setUserDemographicQuestion,
	deleteUserDemographicQuestion,
	selectUserDemographicQuestionsByStatementId,
} from '@/redux/userDemographic/userDemographicSlice';
import { getRandomColor } from '@/controllers/general/helpers';
import BackToMenuArrow from '@/assets/icons/backToMenuArrow.svg?react';
import X from '@/assets/icons/x.svg?react';
import RadioButtonEmptyIcon from '@/assets/icons/radioButtonEmpty.svg?react';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import CheckboxEmptyIcon from '@/assets/icons/checkboxEmptyIcon.svg?react';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { InheritedDemographics } from '@/view/components/atomic/molecules/InheritedDemographics';
import { useInheritedDemographics } from '@/controllers/hooks/userDemographic/useInheritedDemographics';
import { setExcludedInheritedDemographics } from '@/controllers/db/userDemographic/excludedInheritedDemographics';
import { logError } from '@/utils/errorHandling';

interface Props {
	statement: Statement;
}
interface Option {
	option: string;
	color: string;
}

const UserDataSetting: FC<Props> = ({ statement }) => {
	const { t } = useTranslation();
	const dispatch = useDispatch();
	const [showModal, setShowModal] = useState(false); // Get user questions from Redux store filtered by statement ID
	const userQuestions: UserDemographicQuestion[] = useSelector(
		selectUserDemographicQuestionsByStatementId(statement.statementId),
	);
	const defaultOptions: Option[] = [
		{ option: '', color: '#0000ff' },
		{ option: '', color: '#ff0000' },
	];
	const [isQuestionRequired, setIsQuestionRequired] = useState(true);
	const [options, setOptions] = useState<Option[]>(defaultOptions);
	const [selectedQuestionType, setSelectedQuestionType] = useState<UserDemographicQuestionType>(
		UserDemographicQuestionType.text,
	);
	const [applyToGroup, setApplyToGroup] = useState(true);
	const [showBulkPaste, setShowBulkPaste] = useState(false);
	const [bulkPasteText, setBulkPasteText] = useState('');
	const [allowOther, setAllowOther] = useState(false);

	// Check if this is the top parent (group level)
	const isTopParent = statement.parentId === 'top';

	// Get initial excluded IDs from statement settings
	const initialExcludedIds = statement.statementSettings?.excludedInheritedDemographicIds || [];

	// Handle inherited demographics exclusion changes - persist to Firestore
	const handleExcludedIdsChange = useCallback(
		async (excludedIds: string[]) => {
			try {
				await setExcludedInheritedDemographics(statement.statementId, excludedIds);
				console.info(
					'Excluded inherited demographics saved:',
					excludedIds.length,
					'questions excluded',
				);
			} catch (error) {
				logError(error, {
					operation: 'UserDemographicSetting.handleExcludedIdsChange',
					statementId: statement.statementId,
				});
			}
		},
		[statement.statementId],
	);

	// Use the inherited demographics hook
	const {
		inheritedQuestions,
		loading: inheritedLoading,
		toggleQuestion: toggleInheritedQuestion,
	} = useInheritedDemographics({
		statement,
		initialExcludedIds,
		onExcludedIdsChange: handleExcludedIdsChange,
	});

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
		const newQuestionType = formData.get('questionType') as UserDemographicQuestionType;

		if (!newQuestion.trim()) return;

		// Determine the scope based on user selection
		const isGroupLevel = applyToGroup;

		const isMultiOptionType =
			newQuestionType === UserDemographicQuestionType.checkbox ||
			newQuestionType === UserDemographicQuestionType.radio ||
			newQuestionType === UserDemographicQuestionType.dropdown;
		const newQuestionObj: UserDemographicQuestion = {
			userQuestionId: getRandomUID(),
			question: newQuestion.trim(),
			type: newQuestionType,
			statementId: statement.statementId,
			topParentId: statement.topParentId || statement.statementId,
			scope: isGroupLevel ? DEMOGRAPHIC_SCOPE_GROUP : DEMOGRAPHIC_SCOPE_STATEMENT,
			options: isMultiOptionType ? options : [],
			allowOther: isMultiOptionType ? allowOther : undefined,
		};

		dispatch(setUserDemographicQuestion(newQuestionObj));

		// Reset the form
		form.reset();
		setOptions(
			defaultOptions.map((option) => ({
				...option,
				color: getRandomColor(),
			})),
		);
		setAllowOther(false);
		setBulkPasteText('');
		setShowBulkPaste(false);
		setUserDemographicQuestionDB(statement, newQuestionObj);
	};

	const handleDeleteQuestion = (questionIndex: number) => {
		const questionToDelete = userQuestions[questionIndex];
		if (questionToDelete && questionToDelete.userQuestionId) {
			// Find the actual index in the Redux store and dispatch delete action
			const storeIndex = userQuestions.findIndex(
				(q) => q.userQuestionId === questionToDelete.userQuestionId,
			);
			if (storeIndex !== -1) {
				dispatch(deleteUserDemographicQuestion(questionToDelete.userQuestionId));
			}

			deleteUserDemographicQuestionDB(questionToDelete);
		}
	};
	const handleUpdateQuestion = (
		questionIndex: number,
		updatedQuestion: Partial<UserDemographicQuestion>,
	) => {
		const questionToUpdate = userQuestions[questionIndex];
		if (questionToUpdate && questionToUpdate.userQuestionId) {
			const updatedQuestionObj: UserDemographicQuestion = {
				...questionToUpdate,
				...updatedQuestion,
			};
			dispatch(setUserDemographicQuestion(updatedQuestionObj));
			setUserDemographicQuestionDB(statement, updatedQuestionObj);
		}
	};
	const handleBulkPaste = () => {
		const lines = bulkPasteText
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		if (lines.length === 0) return;
		const newOptions: Option[] = lines.map((line) => ({
			option: line,
			color: getRandomColor(),
		}));
		setOptions([...options, ...newOptions]);
		setBulkPasteText('');
		setShowBulkPaste(false);
	};
	const createNewOption = () => {
		setOptions([...options, { option: '', color: getRandomColor() }]);
	};
	const deleteOption = (index: number) => {
		setOptions(options.filter((_, idx) => idx !== index));
	};
	const handleOptionChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
		const value = e.target.value;
		setOptions((prev) => prev.map((opt, i) => (i === index ? { ...opt, option: value } : opt)));
	};
	const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
		const value = e.target.value;
		setOptions((prev) => prev.map((opt, i) => (i === index ? { ...opt, color: value } : opt)));
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
			const updatedQuestion: UserDemographicQuestion = {
				...questionToUpdate,
				options: updatedOptions,
			};
			dispatch(setUserDemographicQuestion(updatedQuestion));
			setUserDemographicOption(questionToUpdate, newOptionObj);
		}
	};

	const handleDeleteOption = (questionIndex: number, optionIndex: number) => {
		const questionToUpdate = userQuestions[questionIndex];
		if (questionToUpdate && questionToUpdate.userQuestionId && questionToUpdate.options) {
			const updatedOptions = questionToUpdate.options.filter((_, idx) => idx !== optionIndex);
			const updatedQuestion: UserDemographicQuestion = {
				...questionToUpdate,
				options: updatedOptions,
			};
			dispatch(setUserDemographicQuestion(updatedQuestion));
		}
		deleteUserDemographicOption(questionToUpdate, questionToUpdate.options[optionIndex].option);
	};

	return (
		<div>
			<SectionTitle title={t('Member Information')} />
			<div className="btns">
				<button className="btn btn--secondary" onClick={() => setShowModal(true)}>
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

						{/* Inherited Demographics Section - Only show for non-top-parent statements */}
						{!isTopParent && inheritedQuestions.length > 0 && (
							<InheritedDemographics
								inheritedQuestions={inheritedQuestions}
								onToggleQuestion={toggleInheritedQuestion}
								loading={inheritedLoading}
								defaultExpanded={false}
							/>
						)}

						{/* New Question Form */}
						<form className={styles.newQuestionForm} onSubmit={handleAddNewQuestion}>
							<input
								name="newQuestion"
								placeholder={t('Write Question here')}
								required
								type="text"
								className={styles.inputQuestion}
							/>
							<div className={styles.selectField}>
								<select
									id="questionType"
									name="questionType"
									value={selectedQuestionType}
									onChange={(e) =>
										setSelectedQuestionType(e.target.value as UserDemographicQuestionType)
									}
								>
									<option value={UserDemographicQuestionType.text}>📝 {t('Text Input')}</option>
									<option value={UserDemographicQuestionType.textarea}>📄 {t('Text Area')}</option>
									<option value={UserDemographicQuestionType.radio}>
										◉ {t('Single Choice (Radio)')}
									</option>
									<option value={UserDemographicQuestionType.checkbox}>
										☑️ {t('Multiple Choice (Checkbox)')}
									</option>
									<option value={UserDemographicQuestionType.dropdown}>{t('Dropdown')}</option>
								</select>
							</div>
							<div className={styles.scopeToggle}>
								<label className={styles.scopeLabel}>
									<input
										type="checkbox"
										checked={applyToGroup}
										onChange={(e) => setApplyToGroup(e.target.checked)}
									/>
									<span>{t('Apply to all sub-discussions')}</span>
								</label>
								<p className={styles.scopeHint}>
									{applyToGroup
										? t('Members will answer these questions once when joining the group')
										: t('Members will answer these questions only for this discussion')}
								</p>
							</div>
							{(selectedQuestionType === UserDemographicQuestionType.radio ||
								selectedQuestionType === UserDemographicQuestionType.checkbox ||
								selectedQuestionType === UserDemographicQuestionType.dropdown) && (
								<div className={styles.addOptionContainer}>
									{options.map((option, indx) => (
										<div className={styles.option} key={indx}>
											{selectedQuestionType === UserDemographicQuestionType.radio ? (
												<RadioButtonEmptyIcon />
											) : (
												<CheckboxEmptyIcon />
											)}
											<input
												name={option.option}
												placeholder={t('Write Answer here')}
												required
												type="text"
												className={styles.inputAnswer}
												value={option.option}
												onChange={(e) => handleOptionChange(e, indx)}
											/>
											<input
												type="color"
												className={styles.optionColor}
												onChange={(e) => handleColorChange(e, indx)}
												value={option.color}
											/>
											<DeleteIcon
												color={allowDelete ? 'red' : 'white'}
												cursor={allowDelete ? 'pointer' : 'default'}
												onClick={() => (allowDelete ? deleteOption(indx) : '')}
											></DeleteIcon>
										</div>
									))}
									<div className={styles.addOption} onClick={createNewOption}>
										<h4>{t('add more options')}</h4>
									</div>
									<button
										type="button"
										className={styles.bulkPasteToggle}
										onClick={() => setShowBulkPaste(!showBulkPaste)}
									>
										{showBulkPaste ? '▲' : '▼'} {t('Bulk Paste Options')}
									</button>
									{showBulkPaste && (
										<div className={styles.bulkPasteSection}>
											<textarea
												className={styles.bulkPasteTextarea}
												value={bulkPasteText}
												onChange={(e) => setBulkPasteText(e.target.value)}
												placeholder={t('Paste options, one per line')}
												rows={6}
											/>
											<div className={styles.bulkPasteActions}>
												{bulkPasteText.split('\n').filter((l) => l.trim()).length > 0 && (
													<span className={styles.bulkPasteCount}>
														{bulkPasteText.split('\n').filter((l) => l.trim()).length}{' '}
														{t('options')}
													</span>
												)}
												<button
													type="button"
													className="btn btn--secondary btn--small"
													onClick={handleBulkPaste}
													disabled={bulkPasteText.split('\n').filter((l) => l.trim()).length === 0}
												>
													{t('Add Pasted Options')}
												</button>
											</div>
										</div>
									)}
									<div className={styles.allowOtherToggle}>
										<label className={styles.allowOtherLabel}>
											<input
												type="checkbox"
												checked={allowOther}
												onChange={(e) => setAllowOther(e.target.checked)}
											/>
											<span>{t('Allow "Other" option')}</span>
										</label>
									</div>
								</div>
							)}

							<div className={styles.bottomBar}>
								<div className={styles.requiredToggle}>
									<span>{t('Required')}</span>
									<div
										className={styles.slideButtonContainer}
										onClick={switchRequired}
										style={{
											backgroundColor: isQuestionRequired ? 'var(--btn-primary)' : '',
										}}
									>
										<div
											className={`${styles.slideButtonHandle} ${isQuestionRequired ? styles.active : styles.inactive}`}
										></div>
									</div>
								</div>
								<div className={styles.spacer}></div>
								<Button text={t('Add Question')} buttonType={ButtonType.PRIMARY} type="submit" />
							</div>
						</form>
						{/* Existing Questions */}
						<div className={styles.existingQuestions}>
							{userQuestions.length === 0 ? (
								<p className={styles.emptyState}>{t('No questions added yet')}</p>
							) : (
								userQuestions.map((question, index) => (
									<UserQuestionComp
										key={question.userQuestionId}
										userQuestions={question}
										questionIndex={index}
										minQuestionAmount={minQuestionAmount}
										onAddOption={handleAddOption}
										onDeleteOption={handleDeleteOption}
										onDeleteQuestion={handleDeleteQuestion}
										onUpdateQuestion={handleUpdateQuestion}
										isTopParent={isTopParent}
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
