import { FC, useState, useEffect } from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import { getStatementSettings } from '../../statementSettingsCont';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import Checkbox from '@/view/components/checkbox/Checkbox';
import styles from './AdvancedSettings.module.scss';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { StatementSettings, StatementType, evaluationType } from 'delib-npm';
import { toggleStatementHide } from '@/controllers/db/statements/setStatements';
import EvaluationTypeSelector from './EvaluationTypeSelector/EvaluationTypeSelector';

const AdvancedSettings: FC<StatementSettingsProps> = ({ statement }) => {
	const { t } = useUserConfig();

	const statementSettings: StatementSettings = getStatementSettings(statement);

	const { hide } = statement;

	const {
		inVotingGetOnlyResults = false,
		evaluationType: currentEvaluationType,
		showEvaluation = false,
		enableAddVotingOption = false,
		enableAddEvaluationOption = false,
		enableSimilaritiesSearch = false,
		enableNavigationalElements = false,
		hasChat = false,
		hasChildren = false,
		joiningEnabled = false,
		enableAddNewSubQuestionsButton = false,
		defaultLookForSimilarities = false,
		enableAIImprovement = false
	} = statementSettings;

	// Determine the initial evaluation type with backward compatibility
	const getInitialEvaluationType = (): evaluationType => {
		if (currentEvaluationType) {
			return currentEvaluationType;
		}
		// Backward compatibility with enhancedEvaluation boolean

		return evaluationType.range;
	};

	// Use local state to immediately reflect changes
	const [selectedEvaluationType, setSelectedEvaluationType] = useState<evaluationType>(getInitialEvaluationType());

	// Update local state when statement changes (e.g., on page reload)
	useEffect(() => {
		setSelectedEvaluationType(getInitialEvaluationType());
	}, [statement.statementId, currentEvaluationType]);

	function handleAdvancedSettingChange(
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
						isChecked={hide}
						onChange={() =>
							toggleStatementHide(statement.statementId)
						}
					/>
					<Checkbox
						label={'Chat'}
						isChecked={hasChat}
						onChange={(checked) =>
							handleAdvancedSettingChange('hasChat', checked)
						}
					/>
					<Checkbox
						label={'Enable Sub-Conversations'}
						isChecked={hasChildren}
						onChange={(checked) =>
							handleAdvancedSettingChange('hasChildren', checked)
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
							isChecked={joiningEnabled}
							onChange={(checked) =>
								handleAdvancedSettingChange('joiningEnabled', checked)
							}
						/>
					)}
					<Checkbox
						label={'Allow participants to contribute options to the voting page'}
						isChecked={enableAddVotingOption}
						onChange={(checked) =>
							handleAdvancedSettingChange('enableAddVotingOption', checked)
						}
					/>
					<Checkbox
						label='Allow participants to contribute options to the evaluation page'
						isChecked={enableAddEvaluationOption}
						onChange={(checked) =>
							handleAdvancedSettingChange('enableAddEvaluationOption', checked)
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
							currentType={selectedEvaluationType}
							onChange={(type) => {
								setSelectedEvaluationType(type);
								handleAdvancedSettingChange('evaluationType', type);
							}}
						/>
					</div>
					<Checkbox
						label={'Show Evaluations results'}
						isChecked={showEvaluation}
						onChange={(checked) =>
							handleAdvancedSettingChange('showEvaluation', checked)
						}
					/>
					<Checkbox
						label='In Voting page, show only the results of the top options'
						isChecked={inVotingGetOnlyResults}
						onChange={(checked) =>
							handleAdvancedSettingChange('inVotingGetOnlyResults', checked)
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
						isChecked={enableAIImprovement}
						onChange={(checked) =>
							handleAdvancedSettingChange('enableAIImprovement', checked)
						}
					/>
					<Checkbox
						label='Allow similarity search'
						isChecked={enableSimilaritiesSearch}
						onChange={(checked) =>
							handleAdvancedSettingChange('enableSimilaritiesSearch', checked)
						}
					/>
					{statement.statementType === StatementType.question && (
						<Checkbox
							label={'By default, look for similar statements'}
							isChecked={defaultLookForSimilarities}
							onChange={(checked) =>
								handleAdvancedSettingChange('defaultLookForSimilarities', checked)
							}
						/>
					)}
				</div>
			</div>

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
							isChecked={enableAddNewSubQuestionsButton}
							onChange={(checked) =>
								handleAdvancedSettingChange('enableAddNewSubQuestionsButton', checked)
							}
						/>
					)}
					<Checkbox
						label='Navigational elements'
						isChecked={enableNavigationalElements}
						onChange={(checked) =>
							handleAdvancedSettingChange('enableNavigationalElements', checked)
						}
					/>
				</div>
			</div>
		</div>
	);
};

export default AdvancedSettings;