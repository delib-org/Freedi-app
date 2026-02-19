import { FC, useState, useEffect } from 'react';
import React from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import { defaultStatementSettings } from '../../emptyStatementModel';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import Checkbox from '@/view/components/checkbox/Checkbox';
import styles from './AdvancedSettings.module.scss';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import {
	StatementSettings,
	StatementType,
	evaluationType,
	Collections,
} from '@freedi/shared-types';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import EvaluationTypeSelector from './EvaluationTypeSelector/EvaluationTypeSelector';
import LanguageSelector from './LanguageSelector/LanguageSelector';
import { setMaxVotesPerUser } from '@/controllers/db/evaluation/setEvaluation';
import {
	getOptionsExceedingMax,
	splitJoinedOption,
} from '@/controllers/db/joining/splitJoinedOption';
import { JOINING } from '@/constants/common';
import { logError } from '@/utils/errorHandling';

interface OptionExceedingMax {
	statementId: string;
	statement: string;
	joinedCount: number;
	maxMembers: number;
	excessCount: number;
}

const AdvancedSettings: FC<StatementSettingsProps> = ({ statement }) => {
	const { t } = useTranslation();

	// Direct access to settings with defaults - no transformation needed
	const settings: StatementSettings = statement.statementSettings ?? defaultStatementSettings;

	// Vote limit state (this needs to remain as it's UI-specific state)
	const [isVoteLimitEnabled, setIsVoteLimitEnabled] = useState<boolean>(
		!!statement.evaluationSettings?.maxVotesPerUser,
	);
	const [maxVotes, setMaxVotes] = useState<number>(
		statement.evaluationSettings?.maxVotesPerUser || 3,
	);

	// Split rooms state
	const [exceedingOptions, setExceedingOptions] = useState<OptionExceedingMax[]>([]);
	const [isLoadingExceeding, setIsLoadingExceeding] = useState(false);
	const [splitRoomSize, setSplitRoomSize] = useState<number>(JOINING.DEFAULT_MAX_MEMBERS);
	const [splittingOptionId, setSplittingOptionId] = useState<string | null>(null);
	const [splitResults, setSplitResults] = useState<{
		optionTitle: string;
		totalRooms: number;
	} | null>(null);

	// Update vote limit state when statement changes
	useEffect(() => {
		setIsVoteLimitEnabled(!!statement.evaluationSettings?.maxVotesPerUser);
		setMaxVotes(statement.evaluationSettings?.maxVotesPerUser || 3);
	}, [statement.statementId, statement.evaluationSettings?.maxVotesPerUser]);

	// Load exceeding options when maxJoinMembers is set
	useEffect(() => {
		if (settings.joiningEnabled && settings.maxJoinMembers) {
			loadExceedingOptions();
		} else {
			setExceedingOptions([]);
		}
	}, [statement.statementId, settings.joiningEnabled, settings.maxJoinMembers]);

	async function loadExceedingOptions() {
		try {
			setIsLoadingExceeding(true);
			const response = await getOptionsExceedingMax(statement.statementId);
			if (response.hasMaxLimit && response.options) {
				setExceedingOptions(response.options);
			} else {
				setExceedingOptions([]);
			}
		} catch (error) {
			logError(error, {
				operation: 'AdvancedSettings.loadExceedingOptions',
				statementId: statement.statementId,
			});
			setExceedingOptions([]);
		} finally {
			setIsLoadingExceeding(false);
		}
	}

	async function handleSplitOption(optionId: string) {
		try {
			setSplittingOptionId(optionId);
			const result = await splitJoinedOption({
				optionStatementId: optionId,
				parentStatementId: statement.statementId,
				roomSize: splitRoomSize,
			});

			if (result.success) {
				setSplitResults({
					optionTitle: result.optionTitle,
					totalRooms: result.totalRooms,
				});
				// Refresh the list
				await loadExceedingOptions();
			}
		} catch (error) {
			logError(error, {
				operation: 'AdvancedSettings.handleSplitOption',
				statementId: optionId,
				metadata: { parentStatementId: statement.statementId, roomSize: splitRoomSize },
			});
		} finally {
			setSplittingOptionId(null);
		}
	}

	// Unified handler for all statement settings
	function handleSettingChange(
		property: keyof StatementSettings,
		newValue: boolean | string | number | undefined,
	) {
		setStatementSettingToDB({
			statement,
			property,
			newValue,
			settingsSection: 'statementSettings',
		});
	}

	// Handler for number input changes
	function handleNumberSettingChange(property: keyof StatementSettings, value: string) {
		const numValue = value === '' ? undefined : Number(value);
		if (numValue === undefined || (numValue >= 1 && numValue <= 1000)) {
			handleSettingChange(property, numValue);
		}
	}

	// Handler for hide toggle (root-level property)
	function handleHideChange(newValue: boolean) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { hide: newValue }, { merge: true });
	}

	// Handler for defaultLanguage (root-level property for survey language)
	function handleDefaultLanguageChange(newLanguage: string) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { defaultLanguage: newLanguage, lastUpdate: Date.now() }, { merge: true });
	}

	// Handler for powerFollowMe toggle (root-level property)
	function handlePowerFollowMeChange(newValue: boolean) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		const powerFollowMePath = newValue ? `/statement/${statement.statementId}/chat` : '';
		updateDoc(statementRef, { powerFollowMe: powerFollowMePath, lastUpdate: Date.now() });
	}

	// Handler for forceLanguage (root-level property for forcing survey language)
	function handleForceLanguageChange(newValue: boolean) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { forceLanguage: newValue, lastUpdate: Date.now() }, { merge: true });
	}

	function handleVoteLimitToggle(enabled: boolean) {
		setIsVoteLimitEnabled(enabled);
		if (enabled) {
			setMaxVotesPerUser(statement.statementId, maxVotes);
		} else {
			setMaxVotesPerUser(statement.statementId, undefined);
		}
	}

	function handleMaxVotesChange(e: React.ChangeEvent<HTMLInputElement>) {
		const value = Number(e.target.value);
		if (value >= 1 && value <= 100) {
			setMaxVotes(value);
			if (isVoteLimitEnabled) {
				setMaxVotesPerUser(statement.statementId, value);
			}
		}
	}

	return (
		<div className={styles.advancedSettings}>
			<h3 className={styles.title}>{t('Advanced Settings')}</h3>

			{/* Visibility & Access Category */}
			<div className={styles.category}>
				<div className={styles.categoryHeader}>
					<span className={styles.categoryTitle}>{t('Visibility & Access')}</span>
				</div>
				<div className={styles.categoryContent}>
					<Checkbox
						label={'Hide this statement'}
						isChecked={statement.hide ?? false}
						onChange={handleHideChange}
					/>
					<Checkbox
						label={'Chat'}
						isChecked={settings.hasChat ?? false}
						onChange={(checked) => handleSettingChange('hasChat', checked)}
					/>
					<Checkbox
						label={'Enable Sub-Conversations'}
						isChecked={settings.hasChildren ?? false}
						onChange={(checked) => handleSettingChange('hasChildren', checked)}
					/>
					<Checkbox
						label={t('Power Follow Me')}
						isChecked={!!statement.powerFollowMe}
						onChange={handlePowerFollowMeChange}
					/>
				</div>
			</div>

			{/* Smart Join Category - Standalone prominent section for question statements */}
			{statement.statementType === StatementType.question && (
				<div className={`${styles.category} ${styles.smartJoinCategory}`}>
					<div className={styles.categoryHeader}>
						<span className={styles.categoryTitle}>{t('Smart Join')}</span>
						<span className={styles.categoryBadge}>{t('Team Formation')}</span>
					</div>
					<div className={styles.categoryContent}>
						{/* Master toggle */}
						<div className={styles.masterToggle}>
							<Checkbox
								label={t('Enable Smart Join')}
								isChecked={settings.joiningEnabled ?? false}
								onChange={(checked) => handleSettingChange('joiningEnabled', checked)}
							/>
							<p className={styles.featureDescription}>
								{t('Allow participants to join options and form teams with size limits')}
							</p>
						</div>

						{/* Settings revealed when enabled */}
						{settings.joiningEnabled && (
							<div className={styles.settingsGrid}>
								{/* Join Behavior Card */}
								<div className={styles.settingCard}>
									<h4 className={styles.settingCardTitle}>{t('Join Behavior')}</h4>
									<Checkbox
										label={t('Single option join only')}
										isChecked={settings.singleJoinOnly ?? false}
										onChange={(checked) => handleSettingChange('singleJoinOnly', checked)}
									/>
									<p className={styles.helperText}>
										{t('Users can only join one option at a time')}
									</p>
								</div>

								{/* Team Size Limits Card */}
								<div className={styles.settingCard}>
									<h4 className={styles.settingCardTitle}>{t('Team Size Limits')}</h4>
									<div className={styles.numberInputRow}>
										<div className={styles.numberInputGroup}>
											<label>{t('Minimum')}</label>
											<input
												type="number"
												min="1"
												max="1000"
												placeholder={t('None')}
												value={settings.minJoinMembers ?? ''}
												onChange={(e) =>
													handleNumberSettingChange('minJoinMembers', e.target.value)
												}
												className={styles.numberInput}
											/>
										</div>
										<span className={styles.rangeSeparator}>—</span>
										<div className={styles.numberInputGroup}>
											<label>{t('Maximum')}</label>
											<input
												type="number"
												min="1"
												max="1000"
												placeholder={t('None')}
												value={settings.maxJoinMembers ?? ''}
												onChange={(e) =>
													handleNumberSettingChange('maxJoinMembers', e.target.value)
												}
												className={styles.numberInput}
											/>
										</div>
									</div>
									<p className={styles.helperText}>
										{t('Set team size constraints for each option')}
									</p>
								</div>

								{/* Split Rooms Card - Always visible with hint if max not set */}
								<div className={`${styles.settingCard} ${styles.settingCardFull}`}>
									<h4 className={styles.settingCardTitle}>
										{t('Room Splitting')}
										{!settings.maxJoinMembers && (
											<span className={styles.requiresTag}>{t('Set maximum first')}</span>
										)}
									</h4>

									{settings.maxJoinMembers ? (
										<div className={styles.splitRoomsContent}>
											<div className={styles.numberInputGroup}>
												<label>{t('Room size for splitting')}</label>
												<input
													type="number"
													min={JOINING.MIN_ROOM_SIZE}
													max="100"
													value={splitRoomSize}
													onChange={(e) =>
														setSplitRoomSize(Number(e.target.value) || JOINING.DEFAULT_MAX_MEMBERS)
													}
													className={styles.numberInput}
												/>
											</div>

											{isLoadingExceeding ? (
												<p className={styles.loadingText}>{t('Checking options...')}</p>
											) : exceedingOptions.length === 0 ? (
												<p className={styles.noExceedingText}>
													{t('No options exceed the maximum member limit')}
												</p>
											) : (
												<div className={styles.exceedingOptionsList}>
													<p className={styles.exceedingCount}>
														{exceedingOptions.length} {t('options exceed maximum')}
													</p>
													{exceedingOptions.map((option) => (
														<div key={option.statementId} className={styles.exceedingOption}>
															<div className={styles.optionInfo}>
																<span className={styles.optionTitle}>
																	{option.statement.substring(0, 50)}
																	{option.statement.length > 50 ? '...' : ''}
																</span>
																<span className={styles.optionCount}>
																	{option.joinedCount} / {option.maxMembers} {t('members')}
																	<span className={styles.excessBadge}>+{option.excessCount}</span>
																</span>
															</div>
															<button
																className={styles.splitButton}
																onClick={() => handleSplitOption(option.statementId)}
																disabled={splittingOptionId === option.statementId}
															>
																{splittingOptionId === option.statementId
																	? t('Splitting...')
																	: t('Split Rooms')}
															</button>
														</div>
													))}
												</div>
											)}

											{splitResults && (
												<div className={styles.splitSuccess}>
													<p>
														{t('Successfully split')} "{splitResults.optionTitle}" {t('into')}{' '}
														{splitResults.totalRooms} {t('rooms')}
													</p>
													<button
														className={styles.dismissButton}
														onClick={() => setSplitResults(null)}
													>
														{t('Dismiss')}
													</button>
												</div>
											)}

											<button
												className={styles.refreshButton}
												onClick={loadExceedingOptions}
												disabled={isLoadingExceeding}
											>
												{t('Refresh list')}
											</button>
										</div>
									) : (
										<p className={styles.helperText}>
											{t(
												'Set a maximum team size above to enable room splitting for oversized teams',
											)}
										</p>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Participation & Collaboration Category */}
			<div className={styles.category}>
				<div className={styles.categoryHeader}>
					<span className={styles.categoryTitle}>{t('Participation & Collaboration')}</span>
				</div>
				<div className={styles.categoryContent}>
					<Checkbox
						label={'Allow participants to contribute options to the voting page'}
						isChecked={settings.enableAddVotingOption ?? false}
						onChange={(checked) => handleSettingChange('enableAddVotingOption', checked)}
					/>
					<Checkbox
						label="Allow participants to contribute options to the evaluation page"
						isChecked={settings.enableAddEvaluationOption ?? false}
						onChange={(checked) => handleSettingChange('enableAddEvaluationOption', checked)}
					/>
				</div>
			</div>

			{/* Evaluation & Voting Category */}
			<div className={styles.category}>
				<div className={styles.categoryHeader}>
					<span className={styles.categoryTitle}>{t('Evaluation & Voting')}</span>
				</div>
				<div className={styles.categoryContent}>
					<div className={styles.evaluationTypeSection}>
						<label className={styles.sectionLabel}>{t('Evaluation Type')}</label>
						<EvaluationTypeSelector
							currentType={settings.evaluationType ?? evaluationType.range}
							onChange={(type) => {
								handleSettingChange('evaluationType', type);
							}}
						/>
					</div>

					{/* Vote Limiting for Single-Like Evaluation */}
					{(settings.evaluationType ?? evaluationType.range) === evaluationType.singleLike && (
						<div className={styles.voteLimitSection}>
							<Checkbox
								label={t('Limit votes per user')}
								isChecked={isVoteLimitEnabled}
								onChange={handleVoteLimitToggle}
							/>
							{isVoteLimitEnabled && (
								<div className={styles.voteLimitInput}>
									<label>{t('Maximum votes per user')}</label>
									<input
										type="number"
										min="1"
										max="100"
										value={maxVotes}
										onChange={handleMaxVotesChange}
										className={styles.numberInput}
									/>
									<span className={styles.helperText}>
										{t('Users can vote for up to')} {maxVotes} {t('options')}
									</span>
								</div>
							)}
						</div>
					)}

					<Checkbox
						label={'Show Evaluations results'}
						isChecked={settings.showEvaluation ?? false}
						onChange={(checked) => handleSettingChange('showEvaluation', checked)}
					/>
					<Checkbox
						label={t('Enable user voting/evaluation')}
						isChecked={settings.enableEvaluation ?? true}
						onChange={(checked) => handleSettingChange('enableEvaluation', checked)}
					/>
					<Checkbox
						label="In Voting page, show only the results of the top options"
						isChecked={settings.inVotingGetOnlyResults ?? false}
						onChange={(checked) => handleSettingChange('inVotingGetOnlyResults', checked)}
					/>
					<Checkbox
						label={t('Enable Submit Mode')}
						isChecked={settings.isSubmitMode ?? false}
						onChange={(checked) => handleSettingChange('isSubmitMode', checked)}
					/>
				</div>
			</div>

			{/* AI & Automation Category */}
			<div className={styles.category}>
				<div className={styles.categoryHeader}>
					<span className={styles.categoryTitle}>{t('AI & Automation')}</span>
				</div>
				<div className={styles.categoryContent}>
					<Checkbox
						label={t('Enable AI suggestion improvement')}
						isChecked={settings.enableAIImprovement ?? false}
						onChange={(checked) => handleSettingChange('enableAIImprovement', checked)}
					/>
					<Checkbox
						label="Allow similarity search"
						isChecked={settings.enableSimilaritiesSearch ?? false}
						onChange={(checked) => handleSettingChange('enableSimilaritiesSearch', checked)}
					/>
					{statement.statementType === StatementType.question && (
						<Checkbox
							label={'By default, look for similar statements'}
							isChecked={settings.defaultLookForSimilarities ?? false}
							onChange={(checked) => handleSettingChange('defaultLookForSimilarities', checked)}
						/>
					)}
				</div>
			</div>

			{/* Discussion Framework Category */}
			{statement.statementType === StatementType.question && (
				<div className={styles.category}>
					<div className={styles.categoryHeader}>
						<span className={styles.categoryTitle}>{t('Discussion Framework')}</span>
					</div>
					<div className={styles.categoryContent}>
						<Checkbox
							label={t('Enable Popper-Hebbian Discussion Mode')}
							isChecked={settings.popperianDiscussionEnabled ?? false}
							onChange={(checked) => handleSettingChange('popperianDiscussionEnabled', checked)}
						/>
						<p className={styles.helperText}>
							{t(
								'Transforms discussion into evidence-based Support/Challenge format with weighted scoring and AI-guided idea refinement',
							)}
						</p>
						{settings.popperianDiscussionEnabled && (
							<>
								<Checkbox
									label={t('Enable AI Pre-Check for Options')}
									isChecked={settings.popperianPreCheckEnabled ?? false}
									onChange={(checked) => handleSettingChange('popperianPreCheckEnabled', checked)}
								/>
								<p className={styles.helperText}>
									{t(
										'When enabled, AI will help refine and clarify options before they are posted',
									)}
								</p>
							</>
						)}
					</div>
				</div>
			)}

			{/* Localization Category */}
			<div className={styles.category}>
				<div className={styles.categoryHeader}>
					<span className={styles.categoryTitle}>{t('Localization')}</span>
				</div>
				<div className={styles.categoryContent}>
					<div className={styles.evaluationTypeSection}>
						<label className={styles.sectionLabel}>{t('Survey Default Language')}</label>
						<p className={styles.helperText}>
							{t(
								'This language will be used for surveys when users have no language preference set',
							)}
						</p>
						<LanguageSelector
							currentLanguage={statement.defaultLanguage}
							onChange={handleDefaultLanguageChange}
						/>
					</div>
					<Checkbox
						label={t('Force survey language (override browser preferences)')}
						isChecked={statement.forceLanguage ?? false}
						onChange={handleForceLanguageChange}
					/>
					<p className={styles.helperText}>
						{t(
							'When enabled, all participants will see the survey in the default language regardless of their browser settings',
						)}
					</p>
				</div>
			</div>

			{/* Navigation & Structure Category */}
			<div className={styles.category}>
				<div className={styles.categoryHeader}>
					<span className={styles.categoryTitle}>{t('Navigation & Structure')}</span>
				</div>
				<div className={styles.categoryContent}>
					{statement.statementType === StatementType.question && (
						<Checkbox
							label={'Enable add new sub-questions button'}
							isChecked={settings.enableAddNewSubQuestionsButton ?? false}
							onChange={(checked) => handleSettingChange('enableAddNewSubQuestionsButton', checked)}
						/>
					)}
					<Checkbox
						label="Navigational elements"
						isChecked={settings.enableNavigationalElements ?? false}
						onChange={(checked) => handleSettingChange('enableNavigationalElements', checked)}
					/>
				</div>
			</div>
		</div>
	);
};

export default AdvancedSettings;
