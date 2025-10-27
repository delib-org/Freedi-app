import { FC, useState, useEffect } from 'react';
import React from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import { defaultStatementSettings } from '../../emptyStatementModel';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import Checkbox from '@/view/components/checkbox/Checkbox';
import styles from './AdvancedSettings.module.scss';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { StatementSettings, StatementType, evaluationType, Collections } from 'delib-npm';
import { doc, setDoc } from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import EvaluationTypeSelector from './EvaluationTypeSelector/EvaluationTypeSelector';
import { setMaxVotesPerUser } from '@/controllers/db/evaluation/setEvaluation';

const AdvancedSettings: FC<StatementSettingsProps> = ({ statement }) => {
	const { t } = useUserConfig();

	// Direct access to settings with defaults - no transformation needed
	const settings: StatementSettings = statement.statementSettings ?? defaultStatementSettings;

	// Vote limit state (this needs to remain as it's UI-specific state)
	const [isVoteLimitEnabled, setIsVoteLimitEnabled] = useState<boolean>(!!statement.evaluationSettings?.maxVotesPerUser);
	const [maxVotes, setMaxVotes] = useState<number>(statement.evaluationSettings?.maxVotesPerUser || 3);

	// Update vote limit state when statement changes
	useEffect(() => {
		setIsVoteLimitEnabled(!!statement.evaluationSettings?.maxVotesPerUser);
		setMaxVotes(statement.evaluationSettings?.maxVotesPerUser || 3);
	}, [statement.statementId, statement.evaluationSettings?.maxVotesPerUser]);

	// Unified handler for all statement settings
	function handleSettingChange(
		property: keyof StatementSettings,
		newValue: boolean | string
	) {
		console.info(`Setting ${property} to ${newValue}`);
		setStatementSettingToDB({
			statement,
			property,
			newValue,
			settingsSection: 'statementSettings',
		});
	}

	// Handler for hide toggle (root-level property)
	function handleHideChange(newValue: boolean) {
		const statementRef = doc(FireStore, Collections.statements, statement.statementId);
		setDoc(statementRef, { hide: newValue }, { merge: true });
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
					<span className={styles.categoryTitle}>
						{t('Visibility & Access')}
					</span>
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
						onChange={(checked) =>
							handleSettingChange('hasChat', checked)
						}
					/>
					<Checkbox
						label={'Enable Sub-Conversations'}
						isChecked={settings.hasChildren ?? false}
						onChange={(checked) =>
							handleSettingChange('hasChildren', checked)
						}
					/>
				</div>
			</div>

			{/* Participation & Collaboration Category */}
			<div className={styles.category}>
				<div className={styles.categoryHeader}>
					<span className={styles.categoryTitle}>
						{t('Participation & Collaboration')}
					</span>
				</div>
				<div className={styles.categoryContent}>
					{statement.statementType === StatementType.question && (
						<Checkbox
							label={'Enable Joining an option'}
							isChecked={settings.joiningEnabled ?? false}
							onChange={(checked) =>
								handleSettingChange('joiningEnabled', checked)
							}
						/>
					)}
					<Checkbox
						label={'Allow participants to contribute options to the voting page'}
						isChecked={settings.enableAddVotingOption ?? false}
						onChange={(checked) =>
							handleSettingChange('enableAddVotingOption', checked)
						}
					/>
					<Checkbox
						label='Allow participants to contribute options to the evaluation page'
						isChecked={settings.enableAddEvaluationOption ?? false}
						onChange={(checked) =>
							handleSettingChange('enableAddEvaluationOption', checked)
						}
					/>
				</div>
			</div>

			{/* Evaluation & Voting Category */}
			<div className={styles.category}>
				<div className={styles.categoryHeader}>
					<span className={styles.categoryTitle}>
						{t('Evaluation & Voting')}
					</span>
				</div>
				<div className={styles.categoryContent}>
					<div className={styles.evaluationTypeSection}>
						<label className={styles.sectionLabel}>
							{t('Evaluation Type')}
						</label>
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
						onChange={(checked) =>
							handleSettingChange('showEvaluation', checked)
						}
					/>
					<Checkbox
						label='In Voting page, show only the results of the top options'
						isChecked={settings.inVotingGetOnlyResults ?? false}
						onChange={(checked) =>
							handleSettingChange('inVotingGetOnlyResults', checked)
						}
					/>
					<Checkbox
						label={t('Enable Submit Mode')}
						isChecked={settings.isSubmitMode ?? false}
						onChange={(checked) =>
							handleSettingChange('isSubmitMode', checked)
						}
					/>
				</div>
			</div>

			{/* AI & Automation Category */}
			<div className={styles.category}>
				<div className={styles.categoryHeader}>
					<span className={styles.categoryTitle}>
						{t('AI & Automation')}
					</span>
				</div>
				<div className={styles.categoryContent}>
					<Checkbox
						label={t('Enable AI suggestion improvement')}
						isChecked={settings.enableAIImprovement ?? false}
						onChange={(checked) =>
							handleSettingChange('enableAIImprovement', checked)
						}
					/>
					<Checkbox
						label='Allow similarity search'
						isChecked={settings.enableSimilaritiesSearch ?? false}
						onChange={(checked) =>
							handleSettingChange('enableSimilaritiesSearch', checked)
						}
					/>
					{statement.statementType === StatementType.question && (
						<Checkbox
							label={'By default, look for similar statements'}
							isChecked={settings.defaultLookForSimilarities ?? false}
							onChange={(checked) =>
								handleSettingChange('defaultLookForSimilarities', checked)
							}
						/>
					)}
				</div>
			</div>

			{/* Discussion Framework Category */}
			{statement.statementType === StatementType.question && (
				<div className={styles.category}>
					<div className={styles.categoryHeader}>
						<span className={styles.categoryTitle}>
							{t('Discussion Framework')}
						</span>
					</div>
					<div className={styles.categoryContent}>
						<Checkbox
							label={t('Enable Popper-Hebbian Discussion Mode')}
							isChecked={settings.popperianDiscussionEnabled ?? false}
							onChange={(checked) =>
								handleSettingChange('popperianDiscussionEnabled', checked)
							}
						/>
						<p className={styles.helperText}>
							{t('Transforms discussion into evidence-based Support/Challenge format with weighted scoring and AI-guided idea refinement')}
						</p>
					</div>
				</div>
			)}

			{/* Navigation & Structure Category */}
			<div className={styles.category}>
				<div className={styles.categoryHeader}>
					<span className={styles.categoryTitle}>
						{t('Navigation & Structure')}
					</span>
				</div>
				<div className={styles.categoryContent}>
					{statement.statementType === StatementType.question && (
						<Checkbox
							label={'Enable add new sub-questions button'}
							isChecked={settings.enableAddNewSubQuestionsButton ?? false}
							onChange={(checked) =>
								handleSettingChange('enableAddNewSubQuestionsButton', checked)
							}
						/>
					)}
					<Checkbox
						label='Navigational elements'
						isChecked={settings.enableNavigationalElements ?? false}
						onChange={(checked) =>
							handleSettingChange('enableNavigationalElements', checked)
						}
					/>
				</div>
			</div>
		</div>
	);
};

export default AdvancedSettings;