import { FC } from 'react';
import { Statement, StatementSettings, StatementType } from '@freedi/shared-types';
import { UserPlus, Plus } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import ToggleSwitch from './ToggleSwitch';

interface ParticipationSettingsProps {
	statement: Statement;
	settings: StatementSettings;
	handleSettingChange: (
		property: keyof StatementSettings,
		newValue: boolean | string | number,
	) => void;
}

const ParticipationSettings: FC<ParticipationSettingsProps> = ({
	statement,
	settings,
	handleSettingChange,
}) => {
	const { t } = useTranslation();

	return (
		<>
			{statement.statementType === StatementType.question && (
				<ToggleSwitch
					isChecked={settings.joiningEnabled ?? false}
					onChange={(checked) => handleSettingChange('joiningEnabled', checked)}
					label={t('Enable Joining Options')}
					description={t('Allow users to join and support specific options')}
					icon={UserPlus}
				/>
			)}
			<ToggleSwitch
				isChecked={settings.enableAddVotingOption ?? false}
				onChange={(checked) => handleSettingChange('enableAddVotingOption', checked)}
				label={t('Add Options in Voting')}
				description={t('Participants can contribute new options while voting')}
				icon={Plus}
				badge="recommended"
			/>
			<ToggleSwitch
				isChecked={settings.enableAddEvaluationOption ?? false}
				onChange={(checked) => handleSettingChange('enableAddEvaluationOption', checked)}
				label={t('Add Options in Evaluation')}
				description={t('Participants can add options during evaluation')}
				icon={Plus}
			/>
		</>
	);
};

export default ParticipationSettings;
