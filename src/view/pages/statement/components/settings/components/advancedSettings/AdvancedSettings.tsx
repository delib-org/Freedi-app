import { FC } from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import { getStatementSettings } from '../../statementSettingsCont';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import Checkbox from '@/view/components/checkbox/Checkbox';
import styles from './AdvancedSettings.module.scss';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { StatementSettings, StatementType } from 'delib-npm';
import { toggleStatementHide } from '@/controllers/db/statements/setStatements';

const AdvancedSettings: FC<StatementSettingsProps> = ({ statement }) => {
	const { t } = useUserConfig();

	const statementSettings: StatementSettings = getStatementSettings(statement);

	const { hide } = statement;

	const {
		inVotingGetOnlyResults = false,
		enhancedEvaluation = false,
		showEvaluation = false,
		enableAddVotingOption = false,
		enableAddEvaluationOption = false,
		enableSimilaritiesSearch = false,
		enableNavigationalElements = false,
		hasChat = false,
		hasChildren = false,
		joiningEnabled = false,
		enableAddNewSubQuestionsButton = false,
		defaultLookForSimilarities = false
	} = statementSettings;

	function handleAdvancedSettingChange(
		property: keyof StatementSettings,
		newValue: boolean
	) {

		setStatementSettingToDB({
			statement,
			property,
			newValue,
			settingsSection: 'statementSettings',
		});
	}

	return (
		<div className={styles.advancedSettings}>
			<h3 className='title'>{t('Advanced')}</h3>
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
			{statement.statementType === StatementType.question && (
				<>
					<Checkbox
						label={'Enable Joining an option'}
						isChecked={joiningEnabled}
						onChange={(checked) =>
							handleAdvancedSettingChange('joiningEnabled', checked)
						}
					/>
					<Checkbox
						label={'Enable add new sub-questions button'}
						isChecked={enableAddNewSubQuestionsButton}
						onChange={(checked) =>
							handleAdvancedSettingChange('enableAddNewSubQuestionsButton', checked)
						}
					/>
					<Checkbox
						label={'By default, look for similar statements'}
						isChecked={defaultLookForSimilarities}
						onChange={(checked) =>
							handleAdvancedSettingChange('defaultLookForSimilarities', checked)
						}
					/>
				</>
			)}
			<Checkbox
				label={'Enable Sub-Conversations'}
				isChecked={hasChildren}
				onChange={(checked) =>
					handleAdvancedSettingChange('hasChildren', checked)
				}
			/>
			<Checkbox
				label={'Enhanced Evaluation'}
				isChecked={enhancedEvaluation}
				onChange={(checked) =>
					handleAdvancedSettingChange('enhancedEvaluation', checked)
				}
			/>
			<Checkbox
				label={'Show Evaluations results'}
				isChecked={showEvaluation}
				onChange={(checked) =>
					handleAdvancedSettingChange('showEvaluation', checked)
				}
			/>
			<Checkbox
				label={
					'Allow participants to contribute options to the voting page'
				}
				isChecked={enableAddVotingOption}
				onChange={(checked) =>
					handleAdvancedSettingChange(
						'enableAddVotingOption',
						checked
					)
				}
			/>
			<Checkbox
				label='Allow participants to contribute options to the evaluation page'
				isChecked={enableAddEvaluationOption}
				onChange={(checked) =>
					handleAdvancedSettingChange(
						'enableAddEvaluationOption',
						checked
					)
				}
			/>
			<Checkbox
				label='In Voting page, show only the results of the top options'
				isChecked={inVotingGetOnlyResults}
				onChange={(checked) =>
					handleAdvancedSettingChange(
						'inVotingGetOnlyResults',
						checked
					)
				}
			/>
			<Checkbox
				label='Allow similarity search'
				isChecked={enableSimilaritiesSearch}
				onChange={(checked) =>
					handleAdvancedSettingChange(
						'enableSimilaritiesSearch',
						checked
					)
				}
			/>
			<Checkbox
				label='Navigational elements'
				isChecked={enableNavigationalElements}
				onChange={(checked) =>
					handleAdvancedSettingChange(
						'enableNavigationalElements',
						checked
					)
				}
			/>
		</div>
	);
};

export default AdvancedSettings;
