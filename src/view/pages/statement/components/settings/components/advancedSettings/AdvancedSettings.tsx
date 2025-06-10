import { FC } from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import { getStatementSettings } from '../../statementSettingsCont';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import Checkbox from '@/view/components/checkbox/Checkbox';
import './AdvancedSettings.scss';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { StatementSettings } from 'delib-npm';

const AdvancedSettings: FC<StatementSettingsProps> = ({ statement }) => {
	const { t } = useUserConfig();

	const statementSettings: StatementSettings = getStatementSettings(statement);

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
		<div className='advanced-settings'>
			<h3 className='title'>{t('Advanced')}</h3>
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
